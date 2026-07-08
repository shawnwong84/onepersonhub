import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { estimateTokens } from "@/lib/knowledge-ingestion";
import { getObjectPreviewUrl } from "@/lib/object-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        chunks: { orderBy: { chunkIndex: "asc" } },
        runs: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Knowledge document not found" },
        { status: 404 }
      );
    }

    const signedPreviewUrl = await getObjectPreviewUrl({
      bucket: document.storageBucket,
      key: document.storageKey,
    });

    return NextResponse.json({
      ...document,
      previewUrl: document.storageKey
        ? `/api/knowledge/documents/${document.id}/source`
        : signedPreviewUrl,
      signedPreviewUrl,
    });
  } catch (error) {
    logger.error("Failed to fetch knowledge document:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge document" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, extractedText, categoryId } = body;

    const existing = await prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Knowledge document not found" },
        { status: 404 }
      );
    }

    const document = await prisma.knowledgeDocument.update({
      where: { id },
      data: {
        ...(typeof title === "string" && title.trim()
          ? { title: title.trim() }
          : {}),
        ...(typeof extractedText === "string"
          ? {
              extractedText,
              tokenEstimate: estimateTokens(extractedText),
              status: "queued",
              version: { increment: 1 },
            }
          : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    logger.error("Failed to update knowledge document:", error);
    return NextResponse.json(
      { error: "Failed to update knowledge document" },
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
    await prisma.knowledgeDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete knowledge document:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge document" },
      { status: 500 }
    );
  }
}
