import { prisma, prismaUnscoped } from "@/lib/prisma";
import { setCurrentCompany } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";
import {
  createKnowledgeDocumentFromText,
  ingestKnowledgeDocument,
} from "@/lib/knowledge-ingestion";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { assertSafeExternalUrl } from "@/lib/url-safety";
import { acquireWorkerTickLock } from "@/lib/worker-lock";
import { runWithLogContext } from "@/lib/log-context";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeWebsite(url: string): Promise<{
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

  await assertSafeExternalUrl(url);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Paperhuman Knowledge Ingestion/1.0",
    },
    redirect: "manual", // re-validate any redirect target ourselves instead of following blindly
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Redirects are not followed for security reasons; use the direct URL.");
  }
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

export async function crawlWebsite(input: {
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

const SCHEDULE_INTERVALS_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Recrawl website sources whose schedule has elapsed. Runs from the worker. */
export async function runDueWebsiteRecrawls(limit = 2) {
  const sources = await prismaUnscoped.websiteSource.findMany({
    where: {
      schedule: { in: Object.keys(SCHEDULE_INTERVALS_MS) },
      lastStatus: { not: "running" },
    },
    orderBy: { lastCrawledAt: "asc" },
    take: 20,
  });

  const due = sources.filter((source) => {
    const interval = SCHEDULE_INTERVALS_MS[source.schedule];
    if (!interval) return false;
    const last = source.lastCrawledAt?.getTime() || 0;
    return Date.now() - last >= interval;
  }).slice(0, limit);

  let recrawled = 0;
  for (const source of due) {
    setCurrentCompany(source.companyId);
    try {
      await prisma.websiteSource.update({
        where: { id: source.id },
        data: { lastStatus: "running" },
      });

      const pages =
        source.mode === "single_url"
          ? [{ ...(await scrapeWebsite(source.url)), url: source.url }]
          : await crawlWebsite({
              url: source.url,
              includePatterns: source.includePatterns,
              excludePatterns: source.excludePatterns,
              crawlDepth: source.crawlDepth,
            });

      const documentIds: string[] = [];
      for (const page of pages) {
        const document = await createKnowledgeDocumentFromText({
          categoryId: source.categoryId,
          title: page.title,
          sourceType: "website",
          sourceUrl: page.url,
          mimeType: "text/markdown",
          text: page.content,
          metadata: {
            ...page.metadata,
            websiteSourceId: source.id,
            crawledAt: new Date().toISOString(),
            recrawl: true,
          },
        });
        documentIds.push(document.id);
        await ingestKnowledgeDocument(document.id);
      }

      await prisma.websiteSource.update({
        where: { id: source.id },
        data: {
          lastStatus: "indexed",
          lastCrawledAt: new Date(),
          metadata: { documentIds, pageCount: documentIds.length, lastRecrawlAt: new Date().toISOString() },
        },
      });
      await logActivity({
        action: "knowledge.website_recrawled",
        entity: ACTIVITY_ENTITIES.KNOWLEDGE,
        entityId: source.id,
        description: `Scheduled recrawl indexed ${documentIds.length} page(s) from ${source.url}.`,
        metadata: { url: source.url, schedule: source.schedule, pageCount: documentIds.length },
      });
      recrawled += 1;
    } catch (error) {
      logger.error("Scheduled website recrawl failed:", error);
      await prisma.websiteSource
        .update({ where: { id: source.id }, data: { lastStatus: "failed" } })
        .catch(() => {});
      await logActivity({
        action: "knowledge.website_crawl_failed",
        entity: ACTIVITY_ENTITIES.KNOWLEDGE,
        entityId: source.id,
        description: `Scheduled recrawl failed for ${source.url}.`,
        metadata: { url: source.url, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return { checked: sources.length, due: due.length, recrawled };
}

const globalForRecrawl = globalThis as unknown as {
  websiteRecrawlTimer?: NodeJS.Timeout;
  websiteRecrawlInFlight?: Promise<void> | null;
};

async function recrawlTick() {
  return runWithLogContext({ workerRunId: crypto.randomUUID() }, async () => {
    if (!(await acquireWorkerTickLock("website-recrawl", 9 * 60 * 1000))) return;
    await runDueWebsiteRecrawls().catch((error) => logger.error("Website recrawl worker failed:", error));
  });
}

/** Checks every 10 minutes for website sources due a scheduled recrawl. */
export function startWebsiteRecrawlWorker() {
  if (globalForRecrawl.websiteRecrawlTimer) return;
  globalForRecrawl.websiteRecrawlTimer = setInterval(() => {
    globalForRecrawl.websiteRecrawlInFlight = recrawlTick().finally(() => {
      globalForRecrawl.websiteRecrawlInFlight = null;
    });
  }, 10 * 60 * 1000);
  logger.info("Website recrawl worker started.");
}

/** Stops scheduling new ticks and awaits any tick already in progress. */
export async function stopWebsiteRecrawlWorker(): Promise<void> {
  if (globalForRecrawl.websiteRecrawlTimer) {
    clearInterval(globalForRecrawl.websiteRecrawlTimer);
    globalForRecrawl.websiteRecrawlTimer = undefined;
  }
  await globalForRecrawl.websiteRecrawlInFlight;
}
