import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  createKnowledgeDocumentFromText,
  extractDocumentContent,
  ingestKnowledgeDocument,
} from "@/lib/knowledge-ingestion";
import { buildObjectKey, storeObject } from "@/lib/object-storage";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const sourceType = searchParams.get("sourceType");
    const categoryId = searchParams.get("categoryId");

    const where: Prisma.KnowledgeDocumentWhereInput = {
      ...(status ? { status } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(categoryId ? { categoryId } : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.knowledgeDocument.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          _count: { select: { chunks: true, runs: true } },
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.knowledgeDocument.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(documents, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch knowledge documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge documents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const categoryId = String(formData.get("categoryId") || "").trim() || null;
    const titleInput = String(formData.get("title") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const documentId = crypto.randomUUID();
    const storageKey = buildObjectKey({
      documentId,
      fileName: file.name,
    });
    const stored = await storeObject({
      key: storageKey,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      buffer,
    });

    const extracted = await extractDocumentContent({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    const document = await createKnowledgeDocumentFromText({
      id: documentId,
      categoryId,
      title: titleInput || file.name,
      sourceType: "upload",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      storageBucket: stored.bucket,
      storageKey: stored.key,
      storageUrl: stored.url,
      fileSize: file.size,
      text: extracted.text,
      tableData: extracted.tableData,
      metadata: {
        ...(extracted.metadata || {}),
        storageProvider: stored.provider,
      },
    });

    const ingestion = await ingestKnowledgeDocument(document.id);

    await logActivity({
      action: "knowledge.document_uploaded",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      entityId: document.id,
      description: `Uploaded and indexed document: ${document.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        fileName: document.fileName,
        mimeType: document.mimeType,
        categoryId: document.categoryId,
        tokenEstimate: document.tokenEstimate,
        ingestion,
      },
      ...getActivityRequestContext(request),
    });

    const fullDocument = await prisma.knowledgeDocument.findUnique({
      where: { id: document.id },
      include: {
        _count: { select: { chunks: true, runs: true } },
        runs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json(
      { document: fullDocument, ingestion },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to upload knowledge document:", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload knowledge document";
    await logActivity({
      action: "knowledge.document_ingestion_failed",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      description: "Knowledge document upload or ingestion failed.",
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { error: message },
      ...getActivityRequestContext(request),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
