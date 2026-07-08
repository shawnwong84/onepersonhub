import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (channel && channel !== "all") {
      where.channel = channel;
    }

    if (status === "waiting_approval") {
      where.metadata = {
        path: ["pendingWorkflowApproval", "status"],
        equals: "pending",
      };
    } else if (status === "unassigned") {
      where.OR = [
        { metadata: { path: ["assignedToId"], equals: Prisma.JsonNull } },
        { metadata: { path: ["assignedToId"], equals: "" } },
      ];
    } else if (status === "human_takeover") {
      where.metadata = {
        path: ["humanTakeover"],
        equals: true,
      };
    } else if (status === "sla_risk") {
      where.status = { in: ["active", "escalated"] };
      where.updatedAt = { lt: new Date(Date.now() - 30 * 60 * 1000) };
    } else if (status && status !== "all") {
      where.status = status;
    }

    if (search && search.trim()) {
      where.OR = [
        { customerName: { contains: search.trim(), mode: "insensitive" } },
        { customerContact: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { messages: true },
          },
          tags: {
            include: { tag: true },
          },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(conversations, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { channel, customerName, customerContact, status } = body;

    if (!channel || typeof channel !== "string") {
      return NextResponse.json(
        { error: "Channel is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        channel: channel.trim(),
        customerName: customerName?.trim() || "Unknown",
        customerContact: customerContact?.trim() || "",
        status: status || "active",
      },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { messages: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    await logActivity({
      action: "conversation.created",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: conversation.id,
      description: `Created ${conversation.channel} conversation for ${conversation.customerName}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        channel: conversation.channel,
        customerName: conversation.customerName,
        customerContact: conversation.customerContact,
        status: conversation.status,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    logger.error("Failed to create conversation:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
