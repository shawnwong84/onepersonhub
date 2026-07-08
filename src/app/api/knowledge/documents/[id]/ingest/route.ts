import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  extractDocumentContent,
  ingestKnowledgeDocument,
} from "@/lib/knowledge-ingestion";
import { readObject } from "@/lib/object-storage";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "knowledge:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const document = await prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!document) {
      return NextResponse.json(
        { error: "Knowledge document not found" },
        { status: 404 }
      );
    }

    if (document.storageBucket && document.storageKey) {
      const source = await readObject({
        bucket: document.storageBucket,
        key: document.storageKey,
      });
      const extracted = await extractDocumentContent({
        fileName: document.fileName || document.title,
        mimeType: document.mimeType || "application/octet-stream",
        buffer: source,
      });

      await prisma.knowledgeDocument.update({
        where: { id },
        data: {
          extractedText: extracted.text,
          tableData: (extracted.tableData || []) as Prisma.InputJsonValue,
          metadata: {
            ...(document.metadata as Record<string, unknown>),
            ...(extracted.metadata || {}),
            reExtractedAt: new Date().toISOString(),
          },
          tokenEstimate: Math.max(1, Math.ceil(extracted.text.length / 4)),
          status: "queued",
        },
      });
    }

    const ingestion = await ingestKnowledgeDocument(id);
    await logActivity({
      action: "knowledge.document_indexed",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      entityId: id,
      description: `Reindexed knowledge document: ${document.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        fileName: document.fileName,
        mimeType: document.mimeType,
        ingestion,
      },
      ...getActivityRequestContext(request),
    });
    return NextResponse.json(ingestion);
  } catch (error) {
    logger.error("Failed to reingest knowledge document:", error);
    const message =
      error instanceof Error ? error.message : "Failed to reingest knowledge document";
    await logActivity({
      action: "knowledge.document_ingestion_failed",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      description: "Knowledge document reingestion failed.",
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { error: message },
      ...getActivityRequestContext(request),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
