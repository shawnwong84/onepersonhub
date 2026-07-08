import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content, priority, isActive, categoryId } = body;

    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    const entry = await prisma.knowledgeEntry.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content.trim() }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
        ...(categoryId !== undefined && { categoryId }),
        version: { increment: 1 },
      },
      include: {
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    });

    await logActivity({
      action: "knowledge.entry_updated",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      entityId: entry.id,
      description: `Updated knowledge entry: ${entry.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        categoryId: entry.categoryId,
        categoryName: entry.category.name,
        version: entry.version,
        isActive: entry.isActive,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(entry);
  } catch (error) {
    logger.error("Failed to update entry:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    await prisma.knowledgeEntry.delete({ where: { id } });

    await logActivity({
      action: "knowledge.entry_deleted",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      entityId: existing.id,
      description: `Deleted knowledge entry: ${existing.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        categoryId: existing.categoryId,
        version: existing.version,
        isActive: existing.isActive,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
