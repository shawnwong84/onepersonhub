import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  createKnowledgeDocumentFromText,
  ingestKnowledgeDocument,
} from "@/lib/knowledge-ingestion";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { crawlWebsite, scrapeWebsite } from "@/lib/website-crawler";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const sources = await prisma.websiteSource.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ data: sources });
  } catch (error) {
    logger.error("Failed to fetch website sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch website sources" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "knowledge:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const categoryId = typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "A valid http(s) URL is required" },
        { status: 400 }
      );
    }

    const mode = body.mode || "single_url";
    const source = await prisma.websiteSource.create({
      data: {
        companyId: auth.companyId,
        categoryId,
        url,
        mode,
        includePatterns: body.includePatterns || "",
        excludePatterns: body.excludePatterns || "",
        crawlDepth: Number.isFinite(body.crawlDepth) ? body.crawlDepth : 1,
        schedule: body.schedule || "manual",
        lastStatus: "running",
        metadata: {
          firecrawlEnabled: Boolean(process.env.FIRECRAWL_API_KEY),
        } as Prisma.InputJsonValue,
      },
    });

    const pages =
      mode === "single_url"
        ? [{ ...(await scrapeWebsite(url)), url }]
        : await crawlWebsite({
            url,
            includePatterns: body.includePatterns || "",
            excludePatterns: body.excludePatterns || "",
            crawlDepth: Number.isFinite(body.crawlDepth) ? body.crawlDepth : 1,
            sitemap: body.sitemap || "include",
            limit: Number.isFinite(body.limit) ? body.limit : 10,
          });

    const documents = [];
    const ingestions = [];
    for (const page of pages) {
      const document = await createKnowledgeDocumentFromText({
        categoryId,
        title: body.title || page.title,
        sourceType: "website",
        sourceUrl: page.url,
        mimeType: "text/markdown",
        text: page.content,
        metadata: {
          ...page.metadata,
          websiteSourceId: source.id,
          crawledAt: new Date().toISOString(),
        },
      });
      documents.push(document);
      ingestions.push(await ingestKnowledgeDocument(document.id));
    }

    await prisma.websiteSource.update({
      where: { id: source.id },
      data: {
        lastStatus: "indexed",
        lastCrawledAt: new Date(),
        metadata: {
          firecrawlEnabled: Boolean(process.env.FIRECRAWL_API_KEY),
          documentIds: documents.map((document) => document.id),
          pageCount: documents.length,
        },
      },
    });

    await logActivity({
      action: "knowledge.website_crawled",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      entityId: source.id,
      description: `Crawled and indexed website: ${url}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        url,
        mode,
        firecrawlEnabled: Boolean(process.env.FIRECRAWL_API_KEY),
        documentIds: documents.map((document) => document.id),
        pageCount: documents.length,
        ingestions,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ source, documents, ingestions }, { status: 201 });
  } catch (error) {
    logger.error("Failed to ingest website:", error);
    const message = error instanceof Error ? error.message : "Failed to ingest website";
    await logActivity({
      action: "knowledge.website_crawl_failed",
      entity: ACTIVITY_ENTITIES.KNOWLEDGE,
      description: "Website crawl or ingestion failed.",
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { error: message },
      ...getActivityRequestContext(request),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
