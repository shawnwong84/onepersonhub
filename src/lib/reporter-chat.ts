import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { estimateTokens } from "@/lib/knowledge-ingestion";
import { getAccessibleModuleSlugs, type ScopedUser } from "@/lib/rbac-scope";
import { findMarketplaceModule, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";

export interface ReporterChatResult {
  threadId: string;
  reply: string;
  citations: { type: "record" | "signal"; id: string; moduleSlug: string; title: string }[];
  refused: boolean;
}

interface ContextRecord {
  id: string;
  moduleSlug: string;
  moduleName: string;
  recordType: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: Date;
  data: unknown;
}

interface ContextSignal {
  id: string;
  moduleSlug: string;
  signalType: string;
  severity: string;
  status: string;
  title: string;
  description: string;
}

/**
 * The security boundary: everything the model sees is fetched through the
 * user's accessible-module list. Unassigned module data never enters the prompt.
 */
async function gatherScopedContext(accessibleSlugs: string[]) {
  const modules = await prisma.businessModule.findMany({
    where: { slug: { in: accessibleSlugs }, isInstalled: true },
    select: { id: true, slug: true, name: true },
  });
  const moduleIds = modules.map((m) => m.id);
  const bySlug = new Map(modules.map((m) => [m.id, m]));

  const [records, signals] = await Promise.all([
    prisma.moduleRecord.findMany({
      where: { moduleId: { in: moduleIds } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        moduleId: true,
        recordType: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        data: true,
      },
    }),
    prisma.moduleSignal.findMany({
      where: { moduleId: { in: moduleIds }, status: { not: "resolved" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        moduleId: true,
        signalType: true,
        severity: true,
        status: true,
        title: true,
        description: true,
      },
    }),
  ]);

  const contextRecords: ContextRecord[] = records.map((r) => ({
    id: r.id,
    moduleSlug: bySlug.get(r.moduleId)?.slug || "",
    moduleName: bySlug.get(r.moduleId)?.name || "",
    recordType: r.recordType,
    title: r.title,
    status: r.status,
    priority: r.priority,
    updatedAt: r.updatedAt,
    data: r.data,
  }));

  const contextSignals: ContextSignal[] = signals.map((s) => ({
    id: s.id,
    moduleSlug: bySlug.get(s.moduleId)?.slug || "",
    signalType: s.signalType,
    severity: s.severity,
    status: s.status,
    title: s.title,
    description: s.description,
  }));

  return { contextRecords, contextSignals, installedModules: modules };
}

/** Modules the question mentions that the user cannot access. */
function findInaccessibleMentions(question: string, accessibleSlugs: string[]): string[] {
  const q = question.toLowerCase();
  return MARKETPLACE_MODULES.filter((module) => {
    if (accessibleSlugs.includes(module.slug)) return false;
    const name = module.name.toLowerCase();
    return q.includes(name) || q.includes(module.slug.replace(/-/g, " "));
  }).map((module) => module.name);
}

function truncateData(data: unknown): string {
  const text = JSON.stringify(data ?? {});
  return text.length > 300 ? text.slice(0, 300) + "..." : text;
}

async function getOrCreateThread(user: ScopedUser, threadId?: string | null) {
  if (threadId) {
    const thread = await prisma.reporterChatThread.findFirst({
      where: { id: threadId, userId: user.userId },
    });
    if (thread) return thread;
  }
  const latest = await prisma.reporterChatThread.findFirst({
    where: { userId: user.userId },
    orderBy: { updatedAt: "desc" },
  });
  if (latest && !threadId) return latest;
  return prisma.reporterChatThread.create({
    data: { userId: user.userId, userType: user.userType },
  });
}

export async function answerReporterQuestion(
  user: ScopedUser,
  userName: string,
  question: string,
  threadId?: string | null
): Promise<ReporterChatResult> {
  const thread = await getOrCreateThread(user, threadId);
  const accessibleSlugs = await getAccessibleModuleSlugs(user);

  await prisma.reporterChatMessage.create({
    data: { threadId: thread.id, role: "user", content: question },
  });

  // Hard refusal without an LLM call when the question targets modules
  // outside the user's scope.
  const inaccessible = findInaccessibleMentions(question, accessibleSlugs);
  const accessibleNames = accessibleSlugs
    .map((slug) => findMarketplaceModule(slug)?.name)
    .filter(Boolean);
  if (inaccessible.length > 0) {
    const reply = `I can't share information about ${inaccessible.join(", ")} because you don't have access to ${inaccessible.length > 1 ? "those modules" : "that module"}. You can ask me about: ${accessibleNames.join(", ")}.`;
    await prisma.reporterChatMessage.create({
      data: { threadId: thread.id, role: "reporter", content: reply, metadata: { refused: true, inaccessible } },
    });
    await prisma.reporterChatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    return { threadId: thread.id, reply, citations: [], refused: true };
  }

  const { contextRecords, contextSignals } = await gatherScopedContext(accessibleSlugs);

  const settings = await prisma.settings.findFirst();
  if (!settings?.aiApiKey) {
    const reply = "The AI provider is not configured yet. Ask an admin to set the API key in Settings.";
    await prisma.reporterChatMessage.create({
      data: { threadId: thread.id, role: "reporter", content: reply, metadata: { error: "no_api_key" } },
    });
    return { threadId: thread.id, reply, citations: [], refused: false };
  }

  const recentMessages = await prisma.reporterChatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const systemPrompt = [
    "You are the Reporter Agent, an operations monitor for a small business automation platform called Cosstigo.",
    `You are talking to ${userName}. They can only access these modules: ${accessibleNames.join(", ")}.`,
    "Answer questions about module records, open signals, and operational status using ONLY the data below.",
    "Be concise and practical. When you reference a record or signal, include its id in square brackets like [record:<id>] or [signal:<id>] so the UI can link it.",
    "If the data does not contain the answer, say so plainly - never invent records.",
    "",
    "OPEN SIGNALS (items needing attention):",
    contextSignals.length
      ? contextSignals
          .map((s) => `- [signal:${s.id}] (${s.moduleSlug}) ${s.severity.toUpperCase()} ${s.title}: ${s.description || s.signalType}`)
          .join("\n")
      : "- none",
    "",
    "RECENT MODULE RECORDS:",
    contextRecords.length
      ? contextRecords
          .map((r) => `- [record:${r.id}] (${r.moduleSlug}) ${r.recordType} "${r.title}" status=${r.status} priority=${r.priority} data=${truncateData(r.data)}`)
          .join("\n")
      : "- none",
  ].join("\n");

  const history = recentMessages
    .reverse()
    .map((m) => ({
      role: m.role === "reporter" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  const openai = new OpenAI({ apiKey: settings.aiApiKey });
  let reply: string;
  try {
    const completion = await openai.chat.completions.create({
      model: settings.aiModel,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: Math.min(settings.maxTokens || 1024, 1024),
      temperature: 0.3,
    });
    reply = completion.choices[0]?.message?.content?.trim() || "I could not produce an answer. Please try rephrasing.";
  } catch (error) {
    logger.error("Reporter chat completion failed:", error);
    reply = "I ran into a problem reaching the AI provider. Please try again shortly.";
  }

  // Extract citations the model actually used.
  const citations: ReporterChatResult["citations"] = [];
  for (const match of reply.matchAll(/\[(record|signal):([a-z0-9-]+)\]/gi)) {
    const type = match[1].toLowerCase() as "record" | "signal";
    const id = match[2];
    const source =
      type === "record"
        ? contextRecords.find((r) => r.id === id)
        : contextSignals.find((s) => s.id === id);
    if (source && !citations.some((c) => c.id === id)) {
      citations.push({ type, id, moduleSlug: source.moduleSlug, title: source.title });
    }
  }

  await prisma.reporterChatMessage.create({
    data: {
      threadId: thread.id,
      role: "reporter",
      content: reply,
      metadata: { citations: JSON.parse(JSON.stringify(citations)), modulesInScope: accessibleSlugs },
    },
  });
  await prisma.reporterChatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  const completionTokens = estimateTokens(reply);
  await prisma.tokenUsage
    .create({
      data: {
        provider: settings.aiProvider || "openai",
        model: settings.aiModel,
        feature: "reporter_chat",
        operation: "answer_generation",
        promptTokens: estimateTokens(systemPrompt + question),
        completionTokens,
        totalTokens: completionTokens,
        entityType: "reporter_chat_thread",
        entityId: thread.id,
        metadata: { userId: user.userId, moduleCount: accessibleSlugs.length },
      },
    })
    .catch(() => {
      // Usage logging must not break the chat.
    });

  return { threadId: thread.id, reply, citations, refused: false };
}

/** Used by the heartbeat to push a proactive report into a user's thread. */
export async function postReporterMessage(
  userId: string,
  userType: "owner" | "member",
  content: string,
  metadata: Record<string, unknown> = {}
) {
  const thread =
    (await prisma.reporterChatThread.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })) ||
    (await prisma.reporterChatThread.create({ data: { userId, userType } }));

  await prisma.reporterChatMessage.create({
    data: {
      threadId: thread.id,
      role: "reporter",
      content,
      metadata: JSON.parse(JSON.stringify({ ...metadata, proactive: true })),
    },
  });
  await prisma.reporterChatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  return thread.id;
}
