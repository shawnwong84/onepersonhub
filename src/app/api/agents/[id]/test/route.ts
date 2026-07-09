import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { searchKnowledgeBase } from "@/lib/ai/semantic-search";
import { estimateTokens } from "@/lib/knowledge-ingestion";

// POST /api/agents/[id]/test - dry-run an agent against a sample message.
// Nothing is persisted to conversations; this is the agent test console.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "agents:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const channel = typeof body.channel === "string" ? body.channel : "whatsapp";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        workflows: { include: { flow: { select: { id: true, name: true, isActive: true, nodes: true } } } },
        knowledgeScopes: { where: { isActive: true } },
      },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // KB retrieval through the agent's scope, exactly like the live engine.
    const knowledge = await searchKnowledgeBase(message, 8, { agentId: id });

    // Which of the agent's workflows would consider this message?
    const matchedFlows = agent.workflows
      .map((assignment) => assignment.flow)
      .filter((flow): flow is NonNullable<typeof flow> => Boolean(flow && flow.isActive))
      .filter((flow) => {
        const nodes = Array.isArray(flow.nodes) ? (flow.nodes as Array<{ data?: { nodeType?: string; triggerEvent?: string; channel?: string } }>) : [];
        const trigger = nodes.find((node) => node?.data?.nodeType === "trigger");
        if (!trigger?.data) return false;
        if (trigger.data.triggerEvent && trigger.data.triggerEvent !== "message_received") return false;
        if (trigger.data.channel && trigger.data.channel !== "any" && trigger.data.channel !== channel) return false;
        return true;
      })
      .map((flow) => ({ id: flow.id, name: flow.name }));

    const settings = await prisma.settings.findFirst();
    let reply = "";
    let replyError = "";
    if (!settings?.aiApiKey) {
      replyError = "AI provider is not configured; showing retrieval results only.";
    } else {
      const systemPrompt = [
        agent.systemPrompt || `You are ${agent.name}, a helpful ${agent.tone} customer care agent.`,
        knowledge.length
          ? `\nKnowledge base context:\n${knowledge.map((item) => `- ${item.title}: ${item.content.slice(0, 400)}`).join("\n")}`
          : "\nNo knowledge base entries matched this question.",
        "\nThis is a TEST message from an administrator, not a real customer. Answer as you would in production.",
      ].join("\n");

      try {
        const openai = new OpenAI({ apiKey: settings.aiApiKey });
        const completion = await openai.chat.completions.create({
          model: settings.aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: Math.min(settings.maxTokens || 800, 800),
          temperature: settings.temperature,
        });
        reply = completion.choices[0]?.message?.content?.trim() || "";

        const completionTokens = estimateTokens(reply);
        await prisma.tokenUsage
          .create({
            data: {
              provider: settings.aiProvider || "openai",
              model: settings.aiModel,
              feature: "agent_test",
              operation: "test_console",
              promptTokens: estimateTokens(systemPrompt + message),
              completionTokens,
              totalTokens: completionTokens,
              entityType: "agent",
              entityId: id,
            },
          })
          .catch(() => {});
      } catch (error) {
        logger.error("Agent test completion failed:", error);
        replyError = "The AI provider call failed. Check the API key and model in Settings.";
      }
    }

    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, tone: agent.tone, automationMode: agent.automationMode },
      reply,
      replyError,
      knowledge: knowledge.slice(0, 5).map((item) => ({ id: item.id, title: item.title, score: item.score })),
      knowledgeScopeCount: agent.knowledgeScopes.length,
      usesGlobalKnowledge: agent.useGlobalKnowledge,
      matchedFlows,
    });
  } catch (error) {
    logger.error("Agent test failed:", error);
    return NextResponse.json({ error: "Agent test failed" }, { status: 500 });
  }
}
