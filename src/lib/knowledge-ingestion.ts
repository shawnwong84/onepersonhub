import { createHash } from "crypto";
import path from "path";
import { pathToFileURL } from "url";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { indexKnowledgeEntry } from "@/lib/ai/semantic-search";

type ExtractedDocument = {
  text: string;
  tableData?: unknown[];
  metadata?: Record<string, unknown>;
};

type IngestionLog = {
  at: string;
  stage: string;
  message: string;
};

const CHUNK_TARGET_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 160;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function csvToMarkdownTable(csv: string): { text: string; rows: string[][] } {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) return { text: "", rows };

  const header = rows[0];
  const separator = header.map(() => "---");
  const body = rows.slice(1);
  const tableRows = [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`);

  return {
    text: tableRows.join("\n"),
    rows,
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();

  if (!text) {
    throw new Error("DOCX did not contain extractable text.");
  }

  return {
    text,
    metadata: {
      originalFormat: "docx",
      parser: "mammoth",
      warnings: result.messages.map((message) => message.message),
    },
  };
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(
    pathToFileURL(
      path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        "legacy",
        "build",
        "pdf.worker.mjs"
      )
    ).toString()
  );
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    const text = result.text.trim();

    if (text) {
      return {
        text,
        metadata: {
          originalFormat: "pdf",
          parser: "pdf-parse",
          totalPages: result.total,
          ocr: false,
        },
      };
    }

    const screenshotResult = await parser.getScreenshot({
      first: Math.min(result.total || 10, 10),
      desiredWidth: 1600,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const ocrText = await ocrImageBuffers(
      screenshotResult.pages
        .map((page) => page.data)
        .filter(Boolean)
        .map((page) => Buffer.from(page))
    );

    if (!ocrText.trim()) {
      throw new Error("PDF OCR completed, but no text was detected.");
    }

    return {
      text: ocrText,
      metadata: {
        originalFormat: "pdf",
        parser: "pdf-parse+tesseract.js",
        totalPages: result.total,
        ocr: true,
        ocrPageLimit: 10,
      },
    };
  } finally {
    await parser.destroy();
  }
}

function rowsToMarkdown(rows: unknown[][]): string {
  const normalizedRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));

  if (normalizedRows.length === 0) return "";

  const columnCount = Math.max(...normalizedRows.map((row) => row.length));
  const paddedRows = normalizedRows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const header = paddedRows[0];
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = paddedRows.slice(1);

  return [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

async function extractWorkbook(buffer: Buffer): Promise<ExtractedDocument> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const tableData = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      {
        header: 1,
        defval: "",
        blankrows: false,
      }
    );

    return {
      sheetName,
      rows,
    };
  });

  const text = tableData
    .map((sheet) => {
      const table = rowsToMarkdown(sheet.rows);
      return table ? `## ${sheet.sheetName}\n\n${table}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .trim();

  if (!text) {
    throw new Error("Workbook did not contain extractable table data.");
  }

  return {
    text,
    tableData,
    metadata: {
      originalFormat: "workbook",
      parser: "xlsx",
      sheetCount: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
    },
  };
}

async function ocrImageBuffers(buffers: Buffer[]): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const texts: string[] = [];
    for (const buffer of buffers) {
      const result = await worker.recognize(buffer);
      texts.push(result.data.text.trim());
    }
    return texts.filter(Boolean).join("\n\n---\n\n");
  } finally {
    await worker.terminate();
  }
}

async function extractImageOcr(buffer: Buffer): Promise<ExtractedDocument> {
  const text = await ocrImageBuffers([buffer]);

  if (!text) {
    throw new Error("OCR completed, but no text was detected in the image.");
  }

  return {
    text,
    metadata: {
      originalFormat: "image",
      parser: "tesseract.js",
    },
  };
}

export async function extractDocumentContent(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ExtractedDocument> {
  const extension = input.fileName.split(".").pop()?.toLowerCase() || "";
  const textLike = input.buffer.toString("utf8");

  if (
    input.mimeType.startsWith("text/") ||
    ["txt", "md", "markdown"].includes(extension)
  ) {
    return { text: textLike };
  }

  if (input.mimeType.includes("html") || ["html", "htm"].includes(extension)) {
    return { text: stripHtml(textLike), metadata: { originalFormat: "html" } };
  }

  if (input.mimeType.includes("csv") || extension === "csv") {
    const parsed = csvToMarkdownTable(textLike);
    return {
      text: parsed.text,
      tableData: parsed.rows,
      metadata: { originalFormat: "csv", rowCount: parsed.rows.length },
    };
  }

  if (extension === "docx" || input.mimeType.includes("wordprocessingml")) {
    return extractDocx(input.buffer);
  }

  if (extension === "pdf" || input.mimeType.includes("pdf")) {
    return extractPdf(input.buffer);
  }

  if (
    ["xlsx", "xls"].includes(extension) ||
    input.mimeType.includes("spreadsheetml") ||
    input.mimeType.includes("ms-excel")
  ) {
    return extractWorkbook(input.buffer);
  }

  if (
    ["png", "jpg", "jpeg", "webp", "tif", "tiff"].includes(extension) ||
    input.mimeType.startsWith("image/")
  ) {
    return extractImageOcr(input.buffer);
  }

  throw new Error(`Unsupported document type: ${input.mimeType || extension || "unknown"}`);
}

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sections = normalized
    .split(/\n(?=#{1,6}\s+)/g)
    .flatMap((section) => {
      if (section.length <= CHUNK_TARGET_CHARS) return [section.trim()];
      const chunks: string[] = [];
      let offset = 0;
      while (offset < section.length) {
        chunks.push(section.slice(offset, offset + CHUNK_TARGET_CHARS).trim());
        offset += CHUNK_TARGET_CHARS - CHUNK_OVERLAP_CHARS;
      }
      return chunks;
    })
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return sections.length > 0 ? sections : [normalized];
}

async function appendRunLog(runId: string, logs: IngestionLog[], stage: string, message: string) {
  logs.push({ at: new Date().toISOString(), stage, message });
  await prisma.knowledgeIngestionRun.update({
    where: { id: runId },
    data: {
      stage,
      logs: logs as Prisma.InputJsonValue,
    },
  });
}

export async function ingestKnowledgeDocument(documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
  });

  if (!document) throw new Error("Knowledge document not found");

  const logs: IngestionLog[] = [];
  const run = await prisma.knowledgeIngestionRun.create({
    data: {
      documentId,
      status: "running",
      stage: "extracting",
      logs: logs as Prisma.InputJsonValue,
    },
  });

  try {
    await appendRunLog(run.id, logs, "chunking", "Creating citation-aware chunks.");

    const chunks = chunkText(document.extractedText);
    const tokenEstimate = estimateTokens(document.extractedText);

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId } });

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const entry = await tx.knowledgeEntry.create({
          data: {
            categoryId: document.categoryId || (await ensureImportedCategory(tx)),
            title:
              chunks.length > 1
                ? `${document.title} - Chunk ${index + 1}`
                : document.title,
            content: chunk,
            priority: 0,
            isActive: true,
            metadata: {
              source: "knowledge_document",
              documentId,
              sourceType: document.sourceType,
              sourceUrl: document.sourceUrl,
              fileName: document.fileName,
              chunkIndex: index,
            },
          },
        });

        await tx.knowledgeChunk.create({
          data: {
            documentId,
            knowledgeEntryId: entry.id,
            content: chunk,
            sourceTitle: document.title,
            sourceUrl: document.sourceUrl,
            chunkIndex: index,
            tokenEstimate: estimateTokens(chunk),
            metadata: {
              entryId: entry.id,
              fileName: document.fileName,
              mimeType: document.mimeType,
            },
          },
        });
      }

      await tx.tokenUsage.create({
        data: {
          provider: "local",
          model: "token-estimator",
          feature: "knowledge_ingestion",
          operation: "chunking",
          promptTokens: tokenEstimate,
          totalTokens: tokenEstimate,
          entityType: "knowledge_document",
          entityId: documentId,
          metadata: { runId: run.id, chunkCount: chunks.length },
        },
      });
    });

    await appendRunLog(run.id, logs, "embedding", "Indexing chunks for semantic retrieval.");

    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    if (settings?.aiApiKey) {
      const chunkEntries = await prisma.knowledgeChunk.findMany({
        where: { documentId, knowledgeEntryId: { not: null } },
        select: { knowledgeEntryId: true, tokenEstimate: true },
      });

      for (const chunk of chunkEntries) {
        if (chunk.knowledgeEntryId) {
          await indexKnowledgeEntry(chunk.knowledgeEntryId, settings.aiApiKey);
        }
      }

      const embeddingTokens = chunkEntries.reduce(
        (sum, chunk) => sum + chunk.tokenEstimate,
        0
      );

      await prisma.tokenUsage.create({
        data: {
          provider: "openai",
          model: "text-embedding-3-small",
          feature: "knowledge_ingestion",
          operation: "embedding",
          embeddingTokens,
          totalTokens: embeddingTokens,
          entityType: "knowledge_document",
          entityId: documentId,
          metadata: { runId: run.id },
        },
      });
    } else {
      await appendRunLog(
        run.id,
        logs,
        "embedding",
        "AI API key is not configured; keyword retrieval is available and embeddings can be retried later."
      );
    }

    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status: "indexed",
        tokenEstimate,
      },
    });

    await prisma.knowledgeIngestionRun.update({
      where: { id: run.id },
      data: {
        status: "indexed",
        stage: "indexed",
        extractedChars: document.extractedText.length,
        chunkCount: chunks.length,
        tokenEstimate,
        completedAt: new Date(),
        logs: logs as Prisma.InputJsonValue,
      },
    });

    await createNotification({
      type: "knowledge_ingestion",
      title: "Knowledge document indexed",
      message: `${document.title} is searchable with ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`,
      href: "/knowledge",
      metadata: { documentId, runId: run.id },
    });

    return { runId: run.id, chunkCount: chunks.length, tokenEstimate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";
    logger.error("Failed to ingest knowledge document:", error);

    logs.push({ at: new Date().toISOString(), stage: "failed", message });

    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "failed" },
    });

    await prisma.knowledgeIngestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        stage: "failed",
        error: message,
        completedAt: new Date(),
        logs: logs as Prisma.InputJsonValue,
      },
    });

    await createNotification({
      type: "knowledge_ingestion",
      title: "Knowledge ingestion failed",
      message: `${document.title}: ${message}`,
      priority: "high",
      href: "/knowledge",
      metadata: { documentId, runId: run.id },
    });

    throw error;
  }
}

async function ensureImportedCategory(tx: Prisma.TransactionClient): Promise<string> {
  const existing = await tx.category.findFirst({ where: { name: "Imported Documents" } });
  if (existing) return existing.id;

  const category = await tx.category.create({
    data: {
      name: "Imported Documents",
      description: "Knowledge generated from uploaded documents and crawled pages.",
      icon: "file-text",
      color: "#4A7C9B",
    },
  });

  return category.id;
}

export async function createKnowledgeDocumentFromText(input: {
  id?: string;
  categoryId?: string | null;
  title: string;
  sourceType: string;
  fileName?: string;
  mimeType?: string;
  sourceUrl?: string;
  storageBucket?: string;
  storageKey?: string;
  storageUrl?: string;
  fileSize?: number;
  text: string;
  tableData?: unknown[];
  metadata?: Record<string, unknown>;
}) {
  const hash = contentHash(input.text);
  const duplicate = await prisma.knowledgeDocument.findFirst({
    where: { contentHash: hash },
    orderBy: { createdAt: "desc" },
  });

  return prisma.knowledgeDocument.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      categoryId: input.categoryId || null,
      title: input.title.trim(),
      sourceType: input.sourceType,
      fileName: input.fileName || "",
      mimeType: input.mimeType || "",
      sourceUrl: input.sourceUrl || "",
      storageBucket: input.storageBucket || "",
      storageKey: input.storageKey || "",
      storageUrl: input.storageUrl || "",
      fileSize: input.fileSize || 0,
      status: "queued",
      extractedText: input.text,
      tableData: (input.tableData || []) as Prisma.InputJsonValue,
      contentHash: hash,
      version: duplicate ? duplicate.version + 1 : 1,
      tokenEstimate: estimateTokens(input.text),
      metadata: {
        ...(input.metadata || {}),
        duplicateOf: duplicate?.id || null,
      },
    },
  });
}
