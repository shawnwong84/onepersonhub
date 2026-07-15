import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { owlyTools, executeToolCall } from "./tools";
import { emitNewMessage } from "@/lib/realtime";
import { analyzeSentiment, detectIntent, estimateConfidence, requiresHumanApproval } from "./guardrails";
import { estimateTokens } from "@/lib/knowledge-ingestion";
import { searchKnowledgeBase } from "./semantic-search";
import { resolveAgentRoute } from "@/lib/agent-router";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { currentCompanyId } from "@/lib/tenant-context";
import type {
  AIMessage,
  AIConfig,
  ConversationContext,
  KnowledgeItem,
} from "./types";

function buildSystemPrompt(context: ConversationContext): string {
  const toneGuide: Record<string, string> = {
    friendly:
      "Be warm, approachable, and conversational. Use a casual but professional tone.",
    professional:
      "Be polished and business-like. Maintain a confident, competent tone while remaining personable.",
    formal:
      "Be professional, polished, and courteous. Use formal language and proper grammar.",
    technical:
      "Be precise and detailed. Use technical terminology when appropriate and provide thorough explanations.",
  };

  const knowledgeSection =
    context.knowledgeBase.length > 0
      ? context.knowledgeBase
          .sort((a, b) => b.priority - a.priority)
          .map(
            (k) =>
              `[${k.category}] ${k.title}:\n${k.content}`
          )
          .join("\n\n---\n\n")
      : "No specific knowledge base entries available. Answer based on general knowledge about the business.";

  return `You are ${context.agentName || "Owly"}, the AI customer care assistant for ${context.businessName}.

${context.businessDesc ? `About the business: ${context.businessDesc}` : ""}
${context.agentDescription ? `Assigned agent profile: ${context.agentDescription}` : ""}
${context.agentSystemPrompt ? `Agent-specific instructions:\n${context.agentSystemPrompt}` : ""}

## Communication Style
${toneGuide[context.tone] || toneGuide.friendly}
${context.language !== "auto" ? `Always respond in: ${context.language}` : "Respond in the same language the customer uses."}

## Your Knowledge Base
Use the following information to answer customer questions accurately:

${knowledgeSection}

## Important Guidelines
- Always be helpful and try to resolve the customer's issue
- If a customer references an order number, ticket, or any other specific record, use find_business_record to look it up before answering - never guess or assume its status
- If you cannot answer a question from the knowledge base or a record lookup, honestly say so and offer to connect them with a team member
- Use the create_ticket tool when a customer reports a problem that needs human intervention
- Use send_internal_email to notify relevant team members about urgent issues
- Use get_customer_history to check if the customer has contacted before
- Never make up information that isn't in your knowledge base or returned by a tool
- Keep responses concise but thorough
- The customer is contacting via: ${context.channel}
${context.customerName !== "Unknown" ? `- Customer name: ${context.customerName}` : ""}

## Customer History
${context.customerHistory.length > 0 ? context.customerHistory.join("\n") : "This is the customer's first interaction."}`;
}

async function getKnowledgeBase(): Promise<KnowledgeItem[]> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: { priority: "desc" },
  });

  return entries.map((e: { category: { name: string }; title: string; content: string; priority: number }) => ({
    category: e.category.name,
    title: e.title,
    content: e.content,
    priority: e.priority,
  }));
}

async function getRelevantKnowledgeBase(query: string, agentId?: string | null): Promise<KnowledgeItem[]> {
  const results = await searchKnowledgeBase(query, 8, { agentId });
  if (agentId && results.length === 0) return [];
  if (results.length === 0) return getKnowledgeBase();

  return results.map((result) => ({
    id: result.id,
    category: result.category,
    title: result.title,
    content: result.content,
    priority: Math.round(result.score * 100),
    sourceUrl: result.sourceUrl,
    documentId: result.documentId,
    chunkIndex: result.chunkIndex,
    score: result.score,
  }));
}

async function getAIConfig(): Promise<AIConfig & ConversationContext> {
  let settings = await prisma.settings.findFirst();
  if (!settings) {
    settings = await prisma.settings.create({ data: { companyId: currentCompanyId() } });
  }

  return {
    provider: settings.aiProvider,
    model: settings.aiModel,
    apiKey: settings.aiApiKey,
    maxTokens: settings.maxTokens,
    temperature: settings.temperature,
    businessName: settings.businessName,
    businessDesc: settings.businessDesc,
    welcomeMessage: settings.welcomeMessage,
    tone: settings.tone,
    language: settings.language,
    knowledgeBase: [],
    customerName: "",
    customerHistory: [],
    channel: "",
  };
}

export async function chat(
  conversationId: string,
  userMessage: string,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const config = await getAIConfig();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      agent: true,
      messages: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });

  if (!conversation) {
    return "Conversation not found.";
  }

  // Save the inbound customer message before any AI work so channel messages
  // still appear in the inbox if AI is not configured or temporarily fails.
  const savedUserMessage = await prisma.message.create({
    data: {
      companyId: currentCompanyId(),
      conversationId,
      role: "customer",
      content: userMessage,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  emitNewMessage(conversationId, {
    id: savedUserMessage.id,
    role: "customer",
    content: userMessage,
  });

  if (!config.apiKey) {
    const response = "AI is not configured. Please add your API key in Settings > AI Configuration.";
    const savedMessage = await prisma.message.create({
      data: {
        companyId: currentCompanyId(),
        conversationId,
        role: "assistant",
        content: response,
        toolCalls: {
          source: "ai",
          reason: "ai_not_configured",
          knowledgeBaseCount: 0,
          ...metadata,
        },
      },
    });

    emitNewMessage(conversationId, {
      id: savedMessage.id,
      role: "assistant",
      content: response,
    });

    await logActivity({
      action: "ai.reply_skipped",
      entity: ACTIVITY_ENTITIES.MESSAGE,
      entityId: savedMessage.id,
      description: "AI reply skipped because AI is not configured.",
      metadata: {
        conversationId,
        channel: conversation.channel,
        reason: "ai_not_configured",
        ...metadata,
      },
    });

    return response;
  }

  const knowledgeBase = await getRelevantKnowledgeBase(userMessage, conversation.agentId);

  const context: ConversationContext = {
    ...config,
    knowledgeBase,
    customerName: conversation.customerName,
    channel: conversation.channel,
    customerHistory: [],
    agentName: conversation.agent?.name,
    agentDescription: conversation.agent?.description,
    agentSystemPrompt: conversation.agent?.systemPrompt,
  };

  // Build message history
  const messages: AIMessage[] = [
    { role: "system", content: buildSystemPrompt(context) },
  ];

  for (const msg of conversation.messages) {
    if (msg.role === "customer") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  // Guardrails: check if human approval needed
  const approval = requiresHumanApproval(userMessage);
  if (approval.required) {
    const sentiment = analyzeSentiment(userMessage);
    const intent = detectIntent(userMessage);

    // Store metadata for dashboard visibility
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          escalationReason: approval.reason,
          sentiment: sentiment.sentiment,
          intent: intent.intent,
        },
      },
    });
  }

  // Call AI
  const response = await callAI(config, messages, conversationId);
  const answerTokens = estimateTokens(response);
  await prisma.tokenUsage.create({
    data: {
      companyId: currentCompanyId(),
      provider: config.provider || "openai",
      model: config.model,
      feature: "conversation_ai",
      operation: "answer_generation",
      promptTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
      completionTokens: answerTokens,
      totalTokens: answerTokens,
      entityType: "conversation",
      entityId: conversationId,
      metadata: {
        knowledgeBaseCount: knowledgeBase.length,
        knowledgeBaseTitles: knowledgeBase.slice(0, 5).map((item) => item.title),
        agentId: conversation.agent?.id,
        agentName: conversation.agent?.name,
      },
    },
  });

  // Save assistant message
  const savedMessage = await prisma.message.create({
    data: {
      companyId: currentCompanyId(),
      conversationId,
      role: "assistant",
      content: response,
      toolCalls: {
        source: "ai",
        agentId: conversation.agent?.id,
        agentName: conversation.agent?.name,
        knowledgeBaseCount: knowledgeBase.length,
        knowledgeBaseTitles: knowledgeBase.slice(0, 5).map((item) => item.title),
        knowledgeCitations: knowledgeBase.slice(0, 5).map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          sourceUrl: item.sourceUrl,
          documentId: item.documentId,
          chunkIndex: item.chunkIndex,
          score: item.score,
        })),
        ...metadata,
      },
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Confidence scoring
  const confidence = estimateConfidence(response, knowledgeBase.length, false);
  if (confidence.shouldEscalate) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "escalated" },
    });
  }

  emitNewMessage(conversationId, { id: savedMessage.id, role: "assistant", content: response });

  await logActivity({
    action: "ai.reply_generated",
    entity: ACTIVITY_ENTITIES.MESSAGE,
    entityId: savedMessage.id,
    description: knowledgeBase.length > 0
      ? "AI reply generated using knowledge base context."
      : "AI reply generated without matching knowledge base context.",
    metadata: {
      conversationId,
      channel: conversation.channel,
      agentId: conversation.agent?.id || null,
      agentName: conversation.agent?.name || null,
      knowledgeBaseCount: knowledgeBase.length,
      knowledgeBaseTitles: knowledgeBase.slice(0, 5).map((item) => item.title),
      usedKnowledgeBase: knowledgeBase.length > 0,
      fallbackReason: metadata.workflowReason || null,
      workflowChecked: metadata.workflowChecked || false,
      workflowMatch: metadata.workflowMatch || false,
    },
  });

  return response;
}

async function callAI(
  config: AIConfig,
  messages: AIMessage[],
  conversationId: string,
  depth = 0
): Promise<string> {
  if (depth > 5) {
    return "I apologize, but I'm having trouble processing your request. Let me connect you with a team member.";
  }

  const openai = new OpenAI({ apiKey: config.apiKey });

  let response;
  try {
    response = await openai.chat.completions.create({
      model: config.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: owlyTools as OpenAI.ChatCompletionTool[],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    });
  } catch {
    return "I'm temporarily unable to process your request. Please try again in a moment, or I can connect you with a team member.";
  }

  const choice = response.choices[0];

  if (
    choice.finish_reason === "tool_calls" &&
    choice.message.tool_calls?.length
  ) {
    // Process tool calls
    const toolCalls = choice.message.tool_calls as Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;

    messages.push({
      role: "assistant",
      content: choice.message.content || "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    });

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await executeToolCall(
        toolCall.function.name,
        args,
        conversationId
      );

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
      });
    }

    // Continue the conversation with tool results
    return callAI(config, messages, conversationId, depth + 1);
  }

  return choice.message.content || "I apologize, I could not generate a response.";
}

export async function createNewConversation(
  channel: string,
  customerName: string,
  customerContact: string,
  customerId?: string
) {
  const route = await resolveAgentRoute({
    channel,
    channelAccountIdentifier: customerContact,
  });

  return prisma.conversation.create({
    data: {
      companyId: currentCompanyId(),
      channel,
      customerName,
      customerContact,
      ...(customerId && { customerId }),
      ...(route.agentId && { agentId: route.agentId }),
      ...(route.channelAccountId && { channelAccountId: route.channelAccountId }),
      metadata: {
        ...(route.agent && {
          agentName: route.agent.name,
          agentAutomationMode: route.agent.automationMode,
        }),
        ...(route.channelAccount && {
          channelAccountName: route.channelAccount.name,
          channelAccountIdentifier: route.channelAccount.identifier,
        }),
      },
    },
  });
}
