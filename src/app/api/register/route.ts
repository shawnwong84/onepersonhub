import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { hashPassword, generateToken, setAuthCookie } from "@/lib/auth";
import { DEFAULT_ROLE_PERMISSIONS, BUILT_IN_ROLES } from "@/lib/rbac";
import { CORE_MODULE_SLUGS, findMarketplaceModule } from "@/lib/marketplace/catalog";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { welcomeEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UNSCOPED_ROLES = new Set(["supervisor", "admin"]);

// POST /api/register - creates a brand-new Company + its first Admin
// together, replacing the old single-tenant /setup wizard. Collects only
// the minimum needed to get a workspace running; business profile / AI
// provider config are deferred to /settings post-registration since every
// Settings field already has a sane default.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyName = asString(body.companyName);
    const name = asString(body.name);
    const email = asString(body.email).toLowerCase();
    const username = asString(body.username);
    const password = asString(body.password);

    if (!companyName || !name || !email || !username || !password) {
      return NextResponse.json(
        { error: "Company name, your name, email, username, and password are all required." },
        { status: 400 }
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existingUsername = await prismaUnscoped.admin.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    const existingEmail = await prismaUnscoped.admin.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
    }

    const hashed = await hashPassword(password);

    const { admin, companyId } = await prismaUnscoped.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName } });

      const admin = await tx.admin.create({
        data: {
          companyId: company.id,
          username,
          email,
          password: hashed,
          name,
          role: "admin",
        },
      });

      // Seed this company's own independently-editable copies of the 4
      // built-in roles - not shared global templates (see src/lib/rbac.ts).
      for (const roleName of BUILT_IN_ROLES) {
        const role = await tx.role.create({
          data: {
            companyId: company.id,
            name: roleName,
            label: roleName.charAt(0).toUpperCase() + roleName.slice(1),
            isBuiltIn: true,
            isUnscoped: UNSCOPED_ROLES.has(roleName),
          },
        });
        const permissions = Object.entries(DEFAULT_ROLE_PERMISSIONS)
          .filter(([, roles]) => (roles as readonly string[]).includes(roleName))
          .map(([permission]) => permission);
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              companyId: company.id,
              roleId: role.id,
              permission,
            })),
          });
        }
      }

      await tx.settings.create({ data: { companyId: company.id, businessName: companyName } });

      for (const type of ["whatsapp", "email", "phone"]) {
        await tx.channel.create({
          data: { companyId: company.id, type, isActive: false, status: "disconnected" },
        });
      }

      // Locked by construction - the new admin lands on /billing to pick a
      // plan, reusing the billing-lock flow already built.
      await tx.billingAccount.create({ data: { companyId: company.id, status: "none" } });

      // Core modules (Customer Care, Reporter Agent) ship installed and
      // enabled on every plan, including Free - seed their BusinessModule
      // rows now instead of relying on lazy creation the first time some
      // route happens to call getInstalledModule() for them.
      for (const slug of CORE_MODULE_SLUGS) {
        const catalogEntry = findMarketplaceModule(slug);
        if (!catalogEntry) continue;
        await tx.businessModule.create({
          data: {
            companyId: company.id,
            slug,
            name: catalogEntry.name,
            category: catalogEntry.category,
            description: catalogEntry.description,
            version: catalogEntry.version,
            isInstalled: true,
            isEnabled: true,
            installedAt: new Date(),
            installedBy: name,
            metadata: {
              channels: catalogEntry.channels,
              workflows: catalogEntry.workflows,
              records: catalogEntry.records,
              approvals: catalogEntry.approvals,
              reporterSignals: catalogEntry.reporterSignals,
            },
          },
        });
      }

      return { admin, companyId: company.id };
    });

    // Fired after the transaction commits, and never awaited-and-thrown: an
    // undeliverable welcome email must never fail a successful registration.
    void sendTransactionalEmail({
      to: admin.email,
      subject: "Welcome to Paperhuman",
      html: welcomeEmailHtml(companyName, name),
    });

    const token = generateToken(admin.id, companyId, admin.role, "owner", admin.tokenVersion);
    const response = NextResponse.json({
      success: true,
      user: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, userType: "owner" },
    });
    response.cookies.set(setAuthCookie(token));
    return response;
  } catch (error) {
    logger.error("Failed to register company:", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
