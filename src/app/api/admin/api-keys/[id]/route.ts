import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "admin:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, isActive } = body;

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (name !== undefined && typeof name === "string") {
      updateData.name = name.trim();
    }

    if (isActive !== undefined && typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    // Mask key in response
    const maskedKey =
      apiKey.key.length > 8
        ? "*".repeat(apiKey.key.length - 8) + apiKey.key.slice(-8)
        : apiKey.key;

    await logActivity({
      action: "settings.api_key_updated",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: apiKey.id,
      description: `Updated API key: ${apiKey.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        changedFields: Object.keys(updateData),
        isActive: apiKey.isActive,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ ...apiKey, key: maskedKey });
  } catch (error) {
    logger.error("Failed to update API key:", error);
    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "admin:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    await prisma.apiKey.delete({ where: { id } });

    await logActivity({
      action: "settings.api_key_deleted",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: existing.id,
      description: `Deleted API key: ${existing.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        name: existing.name,
        wasActive: existing.isActive,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete API key:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}
