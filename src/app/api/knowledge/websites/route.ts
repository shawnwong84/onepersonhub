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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeWebsite(url: string): Promise<{
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (apiKey) {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
      }),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl scrape failed with ${response.status}`);
    }

    const data = await response.json();
    const page = data.data || data;
    const content = page.markdown || stripHtml(page.html || "");
    const title = page.metadata?.title || new URL(url).hostname;

    return {
      title,
      content,
      metadata: {
        provider: "firecrawl",
        canonicalUrl: page.metadata?.sourceURL || page.metadata?.url || url,
        title,
      },
    };
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Cosstigo Knowledge Ingestion/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Website fetch failed with ${response.status}`);
  }

  const html = await response.text();
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || new URL(url).hostname;

  return {
    title,
    content: stripHtml(html),
    metadata: {
      provider: "plain_fetch",
      canonicalUrl: url,
      title,
    },
  };
}

async function crawlWebsite(input: {
  url: string;
  includePatterns?: string;
  excludePatterns?: string;
  crawlDepth?: number;
  sitemap?: string;
  limit?: number;
}): Promise<Array<{ title: string; content: string; url: string; metadata: Record<string, unknown> }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    const single = await scrapeWebsite(input.url);
    return [{ ...single, url: input.url }];
  }

  const response = await fetch("https://api.firecrawl.dev/v2/crawl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: input.url,
      includePaths: input.includePatterns
        ? input.includePatterns.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined,
      excludePaths: input.excludePatterns
        ? input.excludePatterns.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined,
      maxDiscoveryDepth: Math.max(0, input.crawlDepth || 1),
      sitemap: input.sitemap || "include",
      limit: Math.min(Math.max(input.limit || 10, 1), 50),
      scrapeOptions: {
        formats: ["markdown", "html"],
        onlyMainContent: true,
        parsers: ["pdf"],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl crawl failed with ${response.status}`);
  }

  const started = await response.json();
  const crawlId = started.id;
  if (!crawlId) {
    throw new Error("Firecrawl crawl did not return a crawl id.");
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusResponse = await fetch(`https://api.firecrawl.dev/v2/crawl/${crawlId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!statusResponse.ok) continue;
    const status = await statusResponse.json();
    if (status.status === "failed") {
      throw new Error("Firecrawl crawl failed.");
    }
    if (status.status === "completed" && Array.isArray(status.data)) {
      return status.data
        .map((page: { markdown?: string; html?: string; metadata?: Record<string, unknown> }) => {
          const pageUrl =
            String(page.metadata?.sourceURL || page.metadata?.url || input.url);
          const title = String(page.metadata?.title || new URL(pageUrl).hostname);
          return {
            title,
            content: page.markdown || stripHtml(page.html || ""),
            url: pageUrl,
            metadata: {
              provider: "firecrawl",
              crawlId,
              canonicalUrl: pageUrl,
              title,
              ...(page.metadata || {}),
            },
          };
        })
        .filter((page: { content: string }) => page.content.trim());
    }
  }

  throw new Error("Firecrawl crawl is still running. Try recrawl again shortly.");
}

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
