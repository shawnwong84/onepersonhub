import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { getConnectorProvider } from "@/lib/connectors/catalog";
import type { Prisma } from "@/generated/prisma/client";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "connectors:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const provider = searchParams.get("provider");
    const where = provider ? { provider } : {};

    const [connectors, total] = await Promise.all([
      prisma.connector.findMany({
        where,
        orderBy: [{ provider: "asc" }, { name: "asc" }],
        skip,
        take,
      }),
      prisma.connector.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(connectors, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch connectors:", error);
    return NextResponse.json({ error: "Failed to fetch connectors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "connectors:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const provider = asString(body.provider);
    const name = asString(body.name);

    const catalogEntry = getConnectorProvider(provider);
    if (!catalogEntry) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }
    if (catalogEntry.authType === "oauth2") {
      return NextResponse.json(
        { error: "OAuth2 providers must be connected via POST /api/connectors/oauth/authorize" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Connector name is required" }, { status: 400 });
    }

    const config: Record<string, string> = {};
    const credentials: Record<string, string> = {};
    for (const field of catalogEntry.fields) {
      const value = asString(body[field.key]);
      if (!value) continue;
      if (field.location === "config") config[field.key] = value;
      else credentials[field.key] = value;
    }

    const authMode = credentials.apiKey ? "api_key" : credentials.username && credentials.password ? "basic" : null;
    if (catalogEntry.provider === "sap" && !authMode) {
      return NextResponse.json({ error: "Provide either an API key or username+password" }, { status: 400 });
    }
    const missingConfig = catalogEntry.fields.filter((f) => f.required && f.location === "config" && !config[f.key]);
    if (missingConfig.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingConfig.map((f) => f.key).join(", ")}` },
        { status: 400 }
      );
    }

    const connector = await prisma.connector.create({
      data: {
        companyId: auth.companyId,
        provider,
        name,
        authType: catalogEntry.authType,
        status: "disconnected",
        config: config as Prisma.InputJsonValue,
        credentials: credentials as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(connector, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "A connector with this provider and name already exists" }, { status: 409 });
    }
    logger.error("Failed to create connector:", error);
    return NextResponse.json({ error: "Failed to create connector" }, { status: 500 });
  }
}
