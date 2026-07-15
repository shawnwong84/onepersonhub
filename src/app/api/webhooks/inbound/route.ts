import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runChannelWorkflows } from "@/lib/workflow-runtime";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

// Generous cap for a JSON trigger payload; blocks memory-pressure abuse
// from a caller sending an oversized body before we even parse it.
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Verifies the optional X-Signature-256 header (format: "sha256=<hex>"),
 * computed by the caller as HMAC-SHA256(rawBody, apiKey). Using the API key
 * itself as the HMAC secret means a proxy/log that captures the header
 * value alone still cannot forge a *different* body without the raw key.
 *
 * Returns null when verification is not applicable (cookie-auth callers -
 * their session already proves identity) or passes; returns an error
 * NextResponse when a signature was required/present but invalid.
 */
function verifyInboundSignature(
  request: NextRequest,
  rawBody: string,
  authMethod: "cookie" | "api_key"
): NextResponse | null {
  if (authMethod !== "api_key") return null; // signatures only apply to API-key callers

  const apiKey = request.headers.get("x-api-key") || "";
  const header = request.headers.get("x-signature-256") || "";
  const requireSignature = process.env.WEBHOOK_INBOUND_REQUIRE_SIGNATURE === "true";

  if (!header) {
    if (requireSignature) {
      return NextResponse.json(
        { error: "X-Signature-256 header is required for this endpoint" },
        { status: 401 }
      );
    }
    return null;
  }

  const expected = "sha256=" + crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
  const provided = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);

  if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
    return NextResponse.json({ error: "Invalid X-Signature-256" }, { status: 401 });
  }

  return null;
}

// POST /api/webhooks/inbound - external systems trigger workflows here.
// Authenticate with an API key (X-API-Key header). Optionally sign the raw
// body with HMAC-SHA256 using that same key (X-Signature-256: sha256=<hex>);
// set WEBHOOK_INBOUND_REQUIRE_SIGNATURE=true to make signing mandatory.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` },
        { status: 413 }
      );
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` },
        { status: 413 }
      );
    }

    const rateResult = await checkRateLimit(`webhook_inbound:${auth.userId}`, RATE_LIMITS.webhookInbound);
    if (!rateResult.allowed) {
      const response = NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return response;
    }

    const signatureError = verifyInboundSignature(request, rawBody, auth.authMethod);
    if (signatureError) {
      logger.warn("Inbound webhook rejected: invalid or missing signature", { userId: auth.userId });
      return signatureError;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerContact = typeof body.customerContact === "string" ? body.customerContact.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 10000) {
      return NextResponse.json({ error: "message is too long (max 10000 characters)" }, { status: 400 });
    }

    let conversation = conversationId
      ? await prisma.conversation.findUnique({ where: { id: conversationId } })
      : null;
    if (conversationId && !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          companyId: auth.companyId,
          channel: "webhook",
          customerName: customerName || "Webhook",
          customerContact: customerContact || "webhook",
          status: "active",
          metadata: { source: "inbound_webhook", createdBy: auth.name || auth.username },
        },
      });
    }

    await prisma.message.create({
      data: {
        companyId: auth.companyId,
        conversationId: conversation.id,
        role: "customer",
        content: message,
        toolCalls: { source: "inbound_webhook" },
      },
    });

    const result = await runChannelWorkflows({
      channel: "webhook",
      triggerEvent: "webhook_received",
      conversationId: conversation.id,
      customerId: conversation.customerId,
      agentId: conversation.agentId,
      channelAccountId: conversation.channelAccountId,
      message,
      saveInputMessage: false,
    });

    await logActivity({
      action: "webhook.inbound_received",
      entity: ACTIVITY_ENTITIES.WORKFLOW,
      entityId: conversation.id,
      description: `Inbound webhook message ${result.handled ? "handled by workflow" : "received"} (${result.flowName || "no matching workflow"}).`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        conversationId: conversation.id,
        handled: result.handled,
        flowId: result.flowId || null,
        flowName: result.flowName || null,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({
      conversationId: conversation.id,
      handled: result.handled,
      flowName: result.flowName || null,
      replies: result.replies,
    });
  } catch (error) {
    logger.error("Inbound webhook failed:", error);
    return NextResponse.json({ error: "Inbound webhook failed" }, { status: 500 });
  }
}
