import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return "*".repeat(key.length - 8) + key.slice(-8);
}

function generateApiKey(): string {
  return "owly_" + crypto.randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "admin:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);

    const [keys, total] = await Promise.all([
      prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.apiKey.count(),
    ]);

    const masked = keys.map((k) => ({
      ...k,
      key: maskKey(k.key),
    }));

    return NextResponse.json(paginatedResponse(masked, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "admin:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Key name is required" },
        { status: 400 }
      );
    }

    const fullKey = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        companyId: auth.companyId,
        name: name.trim(),
        key: fullKey,
      },
    });

    await logActivity({
      action: "settings.api_key_created",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: apiKey.id,
      description: `Created API key: ${apiKey.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        name: apiKey.name,
        isActive: apiKey.isActive,
      },
      ...getActivityRequestContext(request),
    });

    // Return full key only on creation
    return NextResponse.json(
      {
        ...apiKey,
        key: fullKey,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to create API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
