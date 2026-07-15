import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { testConnection } from "@/lib/connectors/test-connection";
import type { Prisma } from "@/generated/prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "connectors:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const connector = await prisma.connector.findUnique({ where: { id } });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    let result;
    try {
      result = await testConnection(connector);
    } catch (error) {
      // OAuth token refresh can throw (e.g. no refresh token, revoked
      // grant) rather than returning a result - normalize it into one so
      // the connector's status/lastError always reflect the outcome.
      result = {
        ok: false,
        message: (error instanceof Error ? error.message : "Test connection failed").slice(0, 500),
        testedAt: new Date().toISOString(),
      };
    }

    const updated = await prisma.connector.update({
      where: { id },
      data: {
        status: result.ok ? "connected" : "error",
        lastTestedAt: new Date(),
        lastTestResult: result as unknown as Prisma.InputJsonValue,
        lastError: result.ok ? null : result.message,
      },
    });

    return NextResponse.json({ result, connector: updated });
  } catch (error) {
    logger.error("Failed to test connector:", error);
    return NextResponse.json({ error: "Failed to test connector" }, { status: 500 });
  }
}
