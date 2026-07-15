import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { getConnectorProvider } from "@/lib/connectors/catalog";
import type { Prisma } from "@/generated/prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "connectors:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const connector = await prisma.connector.findUnique({ where: { id } });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }
    return NextResponse.json(connector);
  } catch (error) {
    logger.error("Failed to fetch connector:", error);
    return NextResponse.json({ error: "Failed to fetch connector" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "connectors:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const existing = await prisma.connector.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const catalogEntry = getConnectorProvider(existing.provider);
    const body = await request.json();

    const data: Prisma.ConnectorUpdateInput = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (catalogEntry) {
      const config = { ...(existing.config as Record<string, unknown>) };
      const credentials = { ...(existing.credentials as Record<string, unknown>) };
      for (const field of catalogEntry.fields) {
        if (!(field.key in body)) continue;
        const value = asString(body[field.key]);
        if (!value) continue; // only send non-empty changed fields, matching channel-accounts.tsx's pattern
        if (field.location === "config") config[field.key] = value;
        else credentials[field.key] = value;
      }
      data.config = config as Prisma.InputJsonValue;
      // Never touch OAuth2 credentials (accessToken/refreshToken) through this
      // generic PATCH - those are only managed by the OAuth callback route.
      if (catalogEntry.authType !== "oauth2") {
        data.credentials = credentials as Prisma.InputJsonValue;
      }
    }

    const connector = await prisma.connector.update({ where: { id }, data });
    return NextResponse.json(connector);
  } catch (error) {
    logger.error("Failed to update connector:", error);
    return NextResponse.json({ error: "Failed to update connector" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "connectors:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    await prisma.connector.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete connector:", error);
    return NextResponse.json({ error: "Failed to delete connector" }, { status: 500 });
  }
}
