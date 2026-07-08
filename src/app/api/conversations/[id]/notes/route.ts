import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { emitConversationUpdate } from "@/lib/realtime";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const content = String(body.content || "").trim();

    if (!content) {
      return NextResponse.json(
        { error: "Note content is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const note = await prisma.internalNote.create({
      data: {
        conversationId: id,
        content,
        authorName: auth.name || auth.username,
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    emitConversationUpdate(id, { internalNoteCreated: note.id });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    logger.error("Failed to create internal note:", error);
    return NextResponse.json(
      { error: "Failed to create internal note" },
      { status: 500 }
    );
  }
}
