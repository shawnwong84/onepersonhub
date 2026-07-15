import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { CORE_MODULE_SLUGS, findMarketplaceModule } from "@/lib/marketplace/catalog";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { ensureModuleScaffold } from "@/lib/module-installer";
import { requireModuleAccess } from "@/lib/rbac-scope";
import { getBillingAccount, canEnableAnotherPaidModule } from "@/lib/billing/status";

type ModuleAction = "install" | "enable" | "disable" | "uninstall" | "configure" | "upgrade";

const actionLabels: Record<ModuleAction, string> = {
  install: "installed",
  enable: "enabled",
  disable: "disabled",
  uninstall: "uninstalled",
  configure: "configured",
  upgrade: "upgraded",
};

function mergeModuleState(slug: string, state: Awaited<ReturnType<typeof prisma.businessModule.findUnique>>) {
  const catalog = findMarketplaceModule(slug);
  if (!catalog) return null;

  const isCore = CORE_MODULE_SLUGS.includes(slug);
  return {
    ...catalog,
    isCore,
    isInstalled: isCore || (state?.isInstalled ?? catalog.isInstalled),
    isEnabled: isCore || (state?.isEnabled ?? catalog.isEnabled),
    installedAt: state?.installedAt?.toISOString() || null,
    installedBy: state?.installedBy || null,
    disabledAt: state?.disabledAt?.toISOString() || null,
    config: state?.config || {},
    metadata: state?.metadata || {},
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth(request, "marketplace:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug } = await params;
    const catalog = findMarketplaceModule(slug);
    if (!catalog) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const denied = await requireModuleAccess(auth, slug, "read");
    if (denied) return denied;

    const state = await prisma.businessModule.findUnique({
      where: { companyId_slug: { companyId: auth.companyId, slug } },
    });
    return NextResponse.json(mergeModuleState(slug, state));
  } catch (error) {
    logger.error("Failed to fetch marketplace module:", error);
    return NextResponse.json(
      { error: "Failed to fetch marketplace module" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth(request, "marketplace:install");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug } = await params;
    const catalog = findMarketplaceModule(slug);
    if (!catalog) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "") as ModuleAction;
    const force = body.force === true;
    const config =
      body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? (body.config as Prisma.InputJsonObject)
        : {};

    if (!["install", "enable", "disable", "uninstall", "configure", "upgrade"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (CORE_MODULE_SLUGS.includes(slug) && (action === "disable" || action === "uninstall")) {
      return NextResponse.json(
        { error: `${catalog.name} is a core module and cannot be ${action === "disable" ? "disabled" : "uninstalled"}.` },
        { status: 400 }
      );
    }

    if ((action === "disable" || action === "uninstall") && !force) {
      const existing = await prisma.businessModule.findUnique({
        where: { companyId_slug: { companyId: auth.companyId, slug } },
        select: {
          id: true,
          _count: { select: { records: true, signals: true } },
        },
      });
      const openRecords = existing
        ? await prisma.moduleRecord.count({
            where: {
              moduleId: existing.id,
              status: { notIn: ["closed", "resolved", "cancelled", "completed"] },
            },
          })
        : 0;
      const openSignals = existing
        ? await prisma.moduleSignal.count({
            where: {
              moduleId: existing.id,
              status: { not: "resolved" },
            },
          })
        : 0;
      const hasUninstallDependencies =
        existing && (existing._count.records > 0 || existing._count.signals > 0);
      const hasDisableDependencies = openRecords > 0 || openSignals > 0;

      if (
        (action === "uninstall" && hasUninstallDependencies) ||
        (action === "disable" && hasDisableDependencies)
      ) {
        return NextResponse.json(
          {
            error:
              action === "disable"
                ? "Module has open records or unresolved Reporter Agent signals. Resolve them or pass force=true to disable."
                : "Module has records or Reporter Agent signals. Disable it or pass force=true to uninstall.",
            records: existing?._count.records || 0,
            signals: existing?._count.signals || 0,
            openRecords,
            openSignals,
          },
          { status: 409 }
        );
      }
    }

    if ((action === "install" || action === "enable") && !CORE_MODULE_SLUGS.includes(slug)) {
      const currentState = await prisma.businessModule.findUnique({
        where: { companyId_slug: { companyId: auth.companyId, slug } },
        select: { isEnabled: true },
      });
      if (!currentState?.isEnabled) {
        const account = await getBillingAccount(auth.companyId);
        if (!(await canEnableAnotherPaidModule(account))) {
          return NextResponse.json(
            {
              error:
                "Module quota exceeded for your current plan. Upgrade your plan or disable another module first.",
              code: "MODULE_QUOTA_EXCEEDED",
            },
            { status: 402 }
          );
        }
      }
    }

    const now = new Date();
    const dataByAction: Record<ModuleAction, Prisma.BusinessModuleUpdateInput> = {
      install: {
        name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        version: catalog.version,
        isInstalled: true,
        isEnabled: true,
        installedAt: now,
        installedBy: auth.name || auth.username,
        disabledAt: null,
        config,
        metadata: {
          channels: catalog.channels,
          workflows: catalog.workflows,
          records: catalog.records,
          approvals: catalog.approvals,
          reporterSignals: catalog.reporterSignals,
        },
      },
      enable: {
        isInstalled: true,
        isEnabled: true,
        disabledAt: null,
      },
      disable: {
        isEnabled: false,
        disabledAt: now,
      },
      uninstall: {
        isInstalled: false,
        isEnabled: false,
        disabledAt: now,
      },
      configure: {
        config,
      },
      upgrade: {
        name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        version: catalog.version,
        isInstalled: true,
        isEnabled: true,
        disabledAt: null,
        metadata: {
          channels: catalog.channels,
          workflows: catalog.workflows,
          records: catalog.records,
          approvals: catalog.approvals,
          reporterSignals: catalog.reporterSignals,
          upgradedAt: now.toISOString(),
          upgradedBy: auth.name || auth.username,
        },
      },
    };

    const createData: Prisma.BusinessModuleCreateInput = {
      companyId: auth.companyId,
      slug,
      name: catalog.name,
      category: catalog.category,
      description: catalog.description,
      version: catalog.version,
      isInstalled: action !== "uninstall",
      isEnabled: action === "install" || action === "enable" || action === "upgrade",
      installedAt: action === "install" || action === "enable" || action === "upgrade" ? now : null,
      installedBy: action === "install" || action === "enable" || action === "upgrade" ? auth.name || auth.username : null,
      disabledAt: action === "disable" || action === "uninstall" ? now : null,
      config,
      metadata: {
        channels: catalog.channels,
        workflows: catalog.workflows,
        records: catalog.records,
        approvals: catalog.approvals,
        reporterSignals: catalog.reporterSignals,
      },
    };

    const moduleState = await prisma.businessModule.upsert({
      where: { companyId_slug: { companyId: auth.companyId, slug } },
      create: createData,
      update: dataByAction[action],
    });
    if (action === "uninstall") {
      await prisma.moduleAssignment.deleteMany({ where: { moduleSlug: slug } });
    }
    const scaffold =
      action === "install" || action === "enable" || action === "upgrade"
        ? await ensureModuleScaffold(catalog, moduleState)
        : null;

    await logActivity({
      action: `module.${action}`,
      entity: ACTIVITY_ENTITIES.MODULE,
      entityId: moduleState.id,
      description: `${auth.name || auth.username} ${actionLabels[action]} module: ${catalog.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        slug,
        moduleName: catalog.name,
        category: catalog.category,
        action,
        isInstalled: moduleState.isInstalled,
        isEnabled: moduleState.isEnabled,
        scaffold,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({
      ...mergeModuleState(
        slug,
        await prisma.businessModule.findUnique({
          where: { companyId_slug: { companyId: auth.companyId, slug } },
        })
      ),
      scaffold,
    });
  } catch (error) {
    logger.error("Failed to update marketplace module:", error);
    return NextResponse.json(
      { error: "Failed to update marketplace module" },
      { status: 500 }
    );
  }
}
