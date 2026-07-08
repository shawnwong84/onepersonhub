"use client";

import { Header } from "@/components/layout/header";
import {
  MessageCircle,
  Mail,
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Bot,
  Workflow,
  Database,
  UserCheck,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Search,
  Send,
  Inbox,
  ArrowLeft,
  Tag,
  FileText,
  StickyNote,
  UserRound,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  cn,
  formatRelativeTime,
  getChannelLabel,
  getStatusColor,
} from "@/lib/utils";
import { unwrapListResponse } from "@/lib/api-response";

interface MessageData {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  toolCalls?: MessageSourceMetadata | null;
  createdAt: string;
}

interface MessageSourceMetadata {
  source?: string;
  flowId?: string;
  flowName?: string;
  stepId?: string;
  knowledgeBaseCount?: number;
  knowledgeBaseTitles?: string[];
  knowledgeCitations?: Array<{
    id?: string;
    title?: string;
    category?: string;
    sourceUrl?: string;
    documentId?: string;
    chunkIndex?: number;
    score?: number;
  }>;
  reason?: string;
  workflowChecked?: boolean;
  workflowMatch?: boolean;
  workflowReason?: string;
  workflowCheckedFlows?: number;
  approvedByName?: string;
  approvalId?: string;
  decision?: string;
  ticketTitle?: string;
  actorName?: string;
  moduleSlug?: string;
  moduleId?: string;
  moduleRecordId?: string;
  recordType?: string;
  signalId?: string;
  signalType?: string;
  severity?: string;
}

interface RealtimeEvent {
  type: string;
  conversationId?: string;
  data?: {
    conversationId?: string;
    messageId?: string;
    role?: string;
    userName?: string;
    presenceChanged?: boolean;
  };
}

interface TagData {
  id: string;
  tag: {
    id: string;
    name: string;
    color: string;
  };
}

interface ConversationData {
  id: string;
  channel: string;
  customerName: string;
  customerContact: string;
  status: string;
  summary: string;
  metadata?: ConversationMetadata | null;
  messages: MessageData[];
  customer?: CustomerProfileData | null;
  tickets?: TicketData[];
  notes?: InternalNoteData[];
  _count: { messages: number };
  tags: TagData[];
  createdAt: string;
  updatedAt: string;
}

interface CustomerProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  tags: string;
  lastContact: string;
}

interface TicketData {
  id: string;
  title: string;
  status: string;
  priority: string;
  resolution: string;
  department?: { id: string; name: string } | null;
  assignedTo?: { id: string; name: string; email: string } | null;
  updatedAt: string;
}

interface InternalNoteData {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

interface PresenceData {
  userId: string;
  userName: string;
  state: "viewing" | "typing";
  updatedAt: number;
}

interface TeamMemberData {
  id: string;
  name: string;
  isAvailable: boolean;
  department?: {
    id: string;
    name: string;
  } | null;
}

interface WorkflowRunStepData {
  id: string;
  nodeLabel: string;
  nodeType: string;
  actionType: string;
  status: string;
  message: string;
  createdAt: string;
}

interface WorkflowRunData {
  id: string;
  flowName: string;
  triggerEvent: string;
  channel: string;
  status: string;
  reason: string;
  messagePreview: string;
  createdAt: string;
  completedAt?: string | null;
  steps: WorkflowRunStepData[];
}

interface ConversationMetadata {
  humanTakeover?: boolean;
  automationPaused?: boolean;
  takeoverByName?: string;
  takeoverAt?: string;
  releasedByName?: string;
  releasedAt?: string;
  assignedToId?: string;
  assignedToName?: string;
  assignedDepartmentName?: string;
  assignedAt?: string;
  assignedBy?: string;
  pendingWorkflowApproval?: PendingWorkflowApproval | null;
}

interface PendingWorkflowApproval {
  id: string;
  status: string;
  flowId: string;
  flowName: string;
  title: string;
  instructions?: string;
  proposedAction?: {
    type?: string;
    label?: string;
    payload?: string;
  } | null;
}

const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
};

const channelColors: Record<string, string> = {
  whatsapp: "text-green-600 bg-green-50",
  email: "text-blue-600 bg-blue-50",
  phone: "text-purple-600 bg-purple-50",
};

const channels = [
  { value: "all", label: "All Channels" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const statuses = [
  { value: "all", label: "All Status" },
  { value: "unassigned", label: "Unassigned" },
  { value: "waiting_approval", label: "Waiting Approval" },
  { value: "human_takeover", label: "Human Takeover" },
  { value: "sla_risk", label: "SLA Risk" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" },
];

function getMessageSource(message: MessageData) {
  if (message.role === "customer") {
    return null;
  }

  const metadata = message.toolCalls || {};

  if (message.role === "admin" || metadata.source === "admin") {
    return {
      label: "Admin",
      detail: "Manual reply",
      icon: UserCheck,
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (metadata.source === "workflow") {
    return {
      label: "Workflow",
      detail: metadata.flowName ? `Workflow: ${metadata.flowName}` : "Workflow reply",
      icon: Workflow,
      className: "bg-violet-50 text-violet-700 border-violet-200",
    };
  }

  if (metadata.source === "workflow_approved") {
    return {
      label: "Workflow + Approved",
      detail: metadata.approvedByName
        ? `Approved by ${metadata.approvedByName}`
        : "Approved by customer service",
      icon: ShieldCheck,
      className: "bg-violet-50 text-violet-700 border-violet-200",
    };
  }

  if (metadata.source === "ticket_automation") {
    return {
      label: "Ticket Automation",
      detail: metadata.ticketTitle
        ? `Ticket closed: ${metadata.ticketTitle}`
        : "Ticket lifecycle reply",
      icon: ShieldCheck,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  if (
    metadata.source === "workflow_module_record" ||
    metadata.moduleRecordId ||
    metadata.source === "workflow_module_signal" ||
    metadata.signalId
  ) {
    return {
      label: metadata.signalId ? "Module Signal" : "Module Record",
      detail: metadata.moduleSlug
        ? `${metadata.moduleSlug}${metadata.recordType ? `: ${metadata.recordType}` : ""}`
        : metadata.signalType || "Module automation",
      icon: FileText,
      className: metadata.signalId
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-cyan-50 text-cyan-700 border-cyan-200",
    };
  }

  if (message.role === "assistant") {
    const kbCount = Number(metadata.knowledgeBaseCount || 0);
    const citationTitles =
      metadata.knowledgeCitations
        ?.map((citation) => citation.title)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || "";
    return {
      label: kbCount > 0 ? "AI Reply + KB" : "AI Reply",
      detail:
        metadata.workflowChecked && metadata.workflowReason
          ? metadata.workflowReason
          : kbCount > 0
            ? citationTitles
              ? `Sources: ${citationTitles}`
              : `Used ${kbCount} active knowledge base ${kbCount === 1 ? "entry" : "entries"}`
            : metadata.reason === "ai_not_configured"
              ? "AI configuration notice"
              : "Generated by AI",
      icon: kbCount > 0 ? Database : Bot,
      className:
        kbCount > 0
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  return null;
}

function previewMessage(content: string, channel: string, maxLength = 72) {
  const withoutEmailHeaders =
    channel === "email"
      ? content
          .replace(/^Subject:\s*[^\n]*(\n+)?/i, "")
          .replace(/\n{2,}/g, " ")
      : content;
  const compact = withoutEmailHeaders.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 1).trim()}...`
    : compact;
}

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsPageContent />
    </Suspense>
  );
}

function ConversationsPageContent() {
  const searchParams = useSearchParams();
  const targetConversationId = searchParams.get("conversationId");
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [sending, setSending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [takeoverLoading, setTakeoverLoading] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalEditText, setApprovalEditText] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunData[]>([]);
  const [presence, setPresence] = useState<PresenceData[]>([]);
  const [runsOpen, setRunsOpen] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setFetchError(null);
      const params = new URLSearchParams();
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/conversations?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      setConversations(unwrapListResponse<ConversationData>(data));
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      setFetchError("Failed to load conversations. Please try refreshing the page.");
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter, searchQuery]);

  const fetchConversationDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data);
      }
    } catch (error) {
      console.error("Failed to fetch conversation detail:", error);
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  const fetchWorkflowRuns = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}/workflow-runs?limit=5`);
      if (!res.ok) return;
      const data = await res.json();
      setWorkflowRuns(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to fetch workflow runs:", error);
    }
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team/members?limit=100");
      if (!res.ok) return;
      const data = await res.json();
      setTeamMembers(unwrapListResponse<TeamMemberData>(data));
    } catch (error) {
      console.error("Failed to fetch team members:", error);
    }
  }, []);

  const fetchPresence = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}/presence`);
      if (!res.ok) return;
      const data = await res.json();
      setPresence(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to fetch presence:", error);
    }
  }, []);

  const updatePresence = useCallback(async (id: string, state: "viewing" | "typing" | "left") => {
    try {
      await fetch(`/api/conversations/${id}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
    } catch {
      // Presence is best effort.
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchTeamMembers();
  }, [fetchConversations, fetchTeamMembers]);

  useEffect(() => {
    if (!targetConversationId || selectedId === targetConversationId) return;
    setSelectedId(targetConversationId);
    setMobileShowDetail(true);
  }, [selectedId, targetConversationId]);

  useEffect(() => {
    if (selectedId) {
      fetchConversationDetail(selectedId);
      fetchWorkflowRuns(selectedId);
      fetchPresence(selectedId);
      updatePresence(selectedId, "viewing");
    }
    return () => {
      if (selectedId) updatePresence(selectedId, "left");
    };
  }, [selectedId, fetchConversationDetail, fetchWorkflowRuns, fetchPresence, updatePresence]);

  useEffect(() => {
    const pending = selectedConversation?.metadata?.pendingWorkflowApproval;
    setApprovalEditText(pending?.proposedAction?.payload || "");
    setApprovalComment("");
  }, [selectedConversation?.metadata?.pendingWorkflowApproval]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const scheduleRefresh = (conversationId?: string) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        fetchConversations();
        const openConversationId = selectedIdRef.current;
        if (openConversationId && (!conversationId || conversationId === openConversationId)) {
          fetchConversationDetail(openConversationId, true);
          fetchWorkflowRuns(openConversationId);
        }
      }, 150);
    };

    const schedulePresenceRefresh = (conversationId?: string) => {
      const openConversationId = selectedIdRef.current;
      if (!openConversationId || conversationId !== openConversationId) return;

      if (presenceTimerRef.current) {
        clearTimeout(presenceTimerRef.current);
      }

      presenceTimerRef.current = setTimeout(() => {
        fetchPresence(openConversationId);
      }, 500);
    };

    const events = new EventSource("/api/realtime?channel=global");

    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === "connected") return;

        const conversationId = event.conversationId || event.data?.conversationId;
        if (event.data?.presenceChanged) {
          schedulePresenceRefresh(conversationId);
          return;
        }

        if (event.type === "typing:start" || event.type === "typing:stop") {
          schedulePresenceRefresh(conversationId);
          return;
        }

        if (
          event.type === "message:new" ||
          event.type === "message:updated" ||
          event.type === "conversation:new" ||
          event.type === "conversation:updated"
        ) {
          scheduleRefresh(conversationId);
        }
      } catch (error) {
        console.error("Failed to parse realtime event:", error);
      }
    };

    events.onerror = () => {
      console.error("Realtime connection interrupted. Browser will retry automatically.");
    };

    return () => {
      events.close();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (presenceTimerRef.current) {
        clearTimeout(presenceTimerRef.current);
      }
    };
  }, [fetchConversationDetail, fetchConversations, fetchWorkflowRuns, fetchPresence]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim(), role: "admin" }),
      });
      if (res.ok) {
        setReplyText("");
        fetchConversationDetail(selectedId);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/conversations/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchConversationDetail(selectedId);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleAddInternalNote = async () => {
    if (!noteText.trim() || !selectedId || savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteText.trim() }),
      });
      if (res.ok) {
        setNoteText("");
        fetchConversationDetail(selectedId);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to add internal note:", error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleTakeoverToggle = async (enabled: boolean) => {
    if (!selectedId || takeoverLoading) return;
    setTakeoverLoading(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/takeover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedConversation(updated);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to update takeover state:", error);
    } finally {
      setTakeoverLoading(false);
    }
  };

  const handleAssignConversation = async (memberId: string) => {
    if (!selectedId || assignmentLoading) return;
    setAssignmentLoading(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/assignment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedConversation(updated);
        fetchConversations();
      }
    } catch (error) {
      console.error("Failed to assign conversation:", error);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const handleWorkflowApproval = async (
    decision: "approve" | "skip" | "reject"
  ) => {
    if (!selectedId || approvalLoading) return;
    setApprovalLoading(true);
    const previousConversation = selectedConversation;
    if (previousConversation?.metadata?.pendingWorkflowApproval) {
      setSelectedConversation({
        ...previousConversation,
        metadata: {
          ...previousConversation.metadata,
          pendingWorkflowApproval: null,
        },
      });
    }
    try {
      const res = await fetch(`/api/conversations/${selectedId}/workflow-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          payload: decision === "approve" ? approvalEditText : undefined,
          comment: approvalComment.trim() || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedConversation(updated);
        fetchConversations();
        fetchWorkflowRuns(selectedId);
      } else if (previousConversation) {
        setSelectedConversation(previousConversation);
        fetchConversationDetail(selectedId, true);
      }
    } catch (error) {
      console.error("Failed to resolve workflow approval:", error);
      if (previousConversation) {
        setSelectedConversation(previousConversation);
        fetchConversationDetail(selectedId, true);
      }
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const pendingApproval = selectedConversation?.metadata?.pendingWorkflowApproval;
  const pendingApprovalHasDecision =
    !!pendingApproval &&
    selectedConversation?.messages.some((message) => {
      const toolCalls = message.toolCalls || {};
      return (
        toolCalls.source === "workflow_approval_decision" &&
        toolCalls.approvalId === pendingApproval.id
      );
    });
  const activePendingApproval =
    pendingApproval?.status === "pending" && !pendingApprovalHasDecision
      ? pendingApproval
      : null;
  const latestWorkflowRun = workflowRuns[0];

  return (
    <>
      <Header
        title="Conversations"
        description="Manage all customer interactions"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Conversation List */}
        <div
          className={cn(
            "w-full md:w-96 lg:w-[420px] border-r border-owly-border flex flex-col bg-owly-surface",
            mobileShowDetail && "hidden md:flex"
          )}
        >
          {/* Filters */}
          <div className="p-3 border-b border-owly-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-owly-text-light" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
              >
                {channels.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
              >
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-sm text-owly-text-light">Loading...</div>
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
                <div className="p-4 rounded-full bg-red-50 mb-4">
                  <Inbox className="h-8 w-8 text-red-400" />
                </div>
                <p className="font-medium text-owly-text">
                  Could not load conversations
                </p>
                <p className="text-sm text-owly-text-light mt-1">
                  {fetchError}
                </p>
                <button
                  onClick={() => { setLoading(true); fetchConversations(); }}
                  className="mt-3 px-4 py-2 text-sm font-medium text-white bg-owly-primary rounded-lg hover:bg-owly-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
                <div className="p-4 rounded-full bg-owly-primary-50 mb-4">
                  <Inbox className="h-8 w-8 text-owly-primary" />
                </div>
                <p className="font-medium text-owly-text">
                  No conversations found
                </p>
                <p className="text-sm text-owly-text-light mt-1">
                  Conversations will appear here when customers reach out
                </p>
              </div>
            ) : (
              <div className="divide-y divide-owly-border">
                {conversations.map((conv) => {
                  const ChannelIcon =
                    channelIcons[conv.channel] || MessageSquare;
                  const lastMessage = conv.messages[0];
                  const isSelected = selectedId === conv.id;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={cn(
                        "w-full px-4 py-3.5 text-left hover:bg-owly-primary-50/50 transition-colors",
                        isSelected && "bg-owly-primary-50 border-l-2 border-l-owly-primary"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg mt-0.5 flex-shrink-0",
                            channelColors[conv.channel] ||
                              "text-owly-primary bg-owly-primary-50"
                          )}
                        >
                          <ChannelIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-owly-text truncate">
                              {conv.customerName}
                            </p>
                            <span className="text-xs text-owly-text-light flex-shrink-0 ml-2">
                              {formatRelativeTime(conv.updatedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-owly-text-light">
                              {getChannelLabel(conv.channel)}
                            </span>
                            <span className="text-xs text-owly-text-light">
                              --
                            </span>
                            <span className="text-xs text-owly-text-light">
                              {conv._count.messages} messages
                            </span>
                            {(conv.metadata?.humanTakeover ||
                              conv.metadata?.automationPaused) && (
                              <>
                                <span className="text-xs text-owly-text-light">
                                  --
                                </span>
                                <span className="text-xs font-semibold text-amber-700">
                                  human takeover
                                </span>
                              </>
                            )}
                            {conv.metadata?.pendingWorkflowApproval?.status === "pending" && (
                              <>
                                <span className="text-xs text-owly-text-light">
                                  --
                                </span>
                                <span className="text-xs font-semibold text-violet-700">
                                  waiting approval
                                </span>
                              </>
                            )}
                            {conv.metadata?.assignedToName && (
                              <>
                                <span className="text-xs text-owly-text-light">
                                  --
                                </span>
                                <span className="text-xs font-semibold text-blue-700">
                                  assigned
                                </span>
                              </>
                            )}
                          </div>
                          {lastMessage && (
                            <p className="text-sm text-owly-text-light mt-1 truncate">
                              {lastMessage.role === "admin" && (
                                <span className="text-owly-primary font-medium">
                                  You:{" "}
                                </span>
                              )}
                              {previewMessage(lastMessage.content, conv.channel)}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-medium",
                                getStatusColor(conv.status)
                              )}
                            >
                              {conv.status}
                            </span>
                            {conv.tags.slice(0, 2).map((ct) => (
                              <span
                                key={ct.id}
                                className="px-1.5 py-0.5 rounded text-xs font-medium bg-owly-primary-50 text-owly-primary"
                              >
                                {ct.tag.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Conversation Detail */}
        <div
          className={cn(
            "flex-1 flex flex-col bg-owly-bg",
            !mobileShowDetail && "hidden md:flex"
          )}
        >
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="p-5 rounded-full bg-owly-surface border border-owly-border mb-4">
                <MessageSquare className="h-10 w-10 text-owly-text-light" />
              </div>
              <p className="font-semibold text-lg text-owly-text">
                Select a conversation
              </p>
              <p className="text-sm text-owly-text-light mt-1 max-w-sm">
                Choose a conversation from the list to view the full message
                thread and reply to customers
              </p>
            </div>
          ) : detailLoading && !selectedConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-sm text-owly-text-light">Loading...</div>
            </div>
          ) : selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="px-4 py-3 bg-owly-surface border-b border-owly-border flex items-center gap-3">
                <button
                  onClick={() => {
                    setMobileShowDetail(false);
                    setSelectedId(null);
                    setSelectedConversation(null);
                  }}
                  className="md:hidden p-1.5 hover:bg-owly-primary-50 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-owly-text" />
                </button>
                <div
                  className={cn(
                    "p-2 rounded-lg flex-shrink-0",
                    channelColors[selectedConversation.channel] ||
                      "text-owly-primary bg-owly-primary-50"
                  )}
                >
                  {(() => {
                    const Icon =
                      channelIcons[selectedConversation.channel] ||
                      MessageSquare;
                    return <Icon className="h-4 w-4" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-owly-text truncate">
                      {selectedConversation.customerName}
                    </h3>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        getStatusColor(selectedConversation.status)
                      )}
                    >
                      {selectedConversation.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-owly-text-light">
                    <span>
                      {getChannelLabel(selectedConversation.channel)}
                    </span>
                    {selectedConversation.customerContact && (
                      <>
                        <span>--</span>
                        <span>{selectedConversation.customerContact}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    value={selectedConversation.metadata?.assignedToId || ""}
                    onChange={(e) => handleAssignConversation(e.target.value)}
                    disabled={assignmentLoading}
                    className="max-w-[180px] text-xs px-2 py-1.5 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
                    title="Assign conversation"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {member.department?.name ? ` - ${member.department.name}` : ""}
                        {!member.isAvailable ? " (offline)" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedConversation.metadata?.humanTakeover ||
                  selectedConversation.metadata?.automationPaused ? (
                    <button
                      onClick={() => handleTakeoverToggle(false)}
                      disabled={takeoverLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-60"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Resume Automation
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTakeoverToggle(true)}
                      disabled={takeoverLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                      Take Over
                    </button>
                  )}
                  <select
                    value={selectedConversation.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="text-xs px-2 py-1.5 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
                  >
                    {statuses
                      .filter(
                        (s) =>
                          ![
                            "all",
                            "unassigned",
                            "waiting_approval",
                            "human_takeover",
                            "sla_risk",
                          ].includes(s.value)
                      )
                      .map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {(selectedConversation.metadata?.humanTakeover ||
                selectedConversation.metadata?.automationPaused) && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                  <span className="font-semibold">Human takeover active.</span>{" "}
                  Workflow and AI replies are paused for this conversation.
                  {selectedConversation.metadata?.takeoverByName && (
                    <span> Taken over by {selectedConversation.metadata.takeoverByName}.</span>
                  )}
                </div>
              )}

              {selectedConversation.metadata?.assignedToName && (
                <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                  <span className="font-semibold">Assigned to </span>
                  {selectedConversation.metadata.assignedToName}
                  {selectedConversation.metadata.assignedDepartmentName && (
                    <span> ({selectedConversation.metadata.assignedDepartmentName})</span>
                  )}
                  {selectedConversation.metadata.assignedBy === "workflow" && (
                    <span> by workflow.</span>
                  )}
                </div>
              )}

              {presence.length > 0 && (
                <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  {presence.some((entry) => entry.state === "typing") ? (
                    <span className="font-semibold">
                      {presence
                        .filter((entry) => entry.state === "typing")
                        .map((entry) => entry.userName)
                        .join(", ")}{" "}
                      typing
                    </span>
                  ) : (
                    <span>
                      Also viewing:{" "}
                      <span className="font-semibold">
                        {presence.map((entry) => entry.userName).join(", ")}
                      </span>
                    </span>
                  )}
                </div>
              )}

              {/* Tags Bar */}
              {selectedConversation.tags.length > 0 && (
                <div className="px-4 py-2 bg-owly-surface border-b border-owly-border flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-owly-text-light" />
                  {selectedConversation.tags.map((ct) => (
                    <span
                      key={ct.id}
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: ct.tag.color + "20",
                        color: ct.tag.color,
                      }}
                    >
                      {ct.tag.name}
                    </span>
                  ))}
                </div>
              )}

              {workflowRuns.length > 0 && (
                <div className="border-b border-owly-border bg-owly-surface">
                  <button
                    onClick={() => setRunsOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-owly-primary-50/50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Workflow className="h-4 w-4 text-violet-600" />
                      <span className="text-sm font-semibold text-owly-text">
                        Workflow timeline
                      </span>
                      {latestWorkflowRun && (
                        <span className="truncate text-xs text-owly-text-light">
                          {latestWorkflowRun.flowName || "Workflow"} - {latestWorkflowRun.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                        {workflowRuns.length}
                      </span>
                      {runsOpen ? (
                        <ChevronDown className="h-4 w-4 text-owly-text-light" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-owly-text-light" />
                      )}
                    </div>
                  </button>

                  {runsOpen && (
                    <div className="space-y-2 border-t border-owly-border px-4 py-3">
                      {workflowRuns.map((run) => (
                        <div
                          key={run.id}
                          className="rounded-lg border border-owly-border bg-owly-bg p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-owly-text">
                                {run.flowName || "Workflow run"}
                              </p>
                              <p className="text-xs text-owly-text-light">
                                {run.triggerEvent} - {formatRelativeTime(run.createdAt)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                run.status === "completed"
                                  ? "bg-green-50 text-green-700"
                                  : run.status === "waiting_approval"
                                    ? "bg-violet-50 text-violet-700"
                                    : run.status === "failed"
                                      ? "bg-red-50 text-red-700"
                                      : "bg-slate-100 text-slate-700"
                              )}
                            >
                              {run.status.replace("_", " ")}
                            </span>
                          </div>
                          {run.reason && (
                            <p className="mt-2 text-xs text-owly-text-light">
                              {run.reason}
                            </p>
                          )}
                          <div className="mt-3 space-y-1.5">
                            {run.steps.slice(0, 5).map((step) => (
                              <div
                                key={step.id}
                                className="flex items-start justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-owly-text">
                                    {step.nodeLabel || step.nodeType || "Step"}
                                  </span>
                                  {step.message && (
                                    <span className="text-owly-text-light">
                                      {" "}- {step.message}
                                    </span>
                                  )}
                                </div>
                                <span className="flex-shrink-0 text-owly-text-light">
                                  {step.status.replace("_", " ")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activePendingApproval && (
                <div className="border-b border-violet-200 bg-violet-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-white p-2 text-violet-700">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-violet-900">
                          Approval required
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-violet-700">
                          {activePendingApproval.flowName}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-violet-950">
                        {activePendingApproval.title}
                      </p>
                      {activePendingApproval.instructions && (
                        <p className="mt-1 text-xs text-violet-700">
                          {activePendingApproval.instructions}
                        </p>
                      )}
                      {activePendingApproval.proposedAction && (
                        <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                            Proposed next step
                          </div>
                          <div className="mt-1 text-sm font-semibold text-owly-text">
                            {activePendingApproval.proposedAction.label}
                          </div>
                          {activePendingApproval.proposedAction.type === "reply_customer" ? (
                            <textarea
                              value={approvalEditText}
                              onChange={(event) => setApprovalEditText(event.target.value)}
                              rows={3}
                              className="mt-2 w-full resize-none rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-owly-text outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                            />
                          ) : (
                            <p className="mt-2 text-sm text-owly-text-light">
                              {activePendingApproval.proposedAction.payload}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="mt-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                          Decision note
                        </label>
                        <textarea
                          value={approvalComment}
                          onChange={(event) => setApprovalComment(event.target.value)}
                          rows={2}
                          placeholder="Optional reason or context for this approval decision"
                          className="mt-1 w-full resize-none rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-owly-text outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleWorkflowApproval("approve")}
                          disabled={approvalLoading}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleWorkflowApproval("skip")}
                          disabled={approvalLoading}
                          className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                        >
                          Skip
                        </button>
                        <button
                          onClick={() => handleWorkflowApproval("reject")}
                          disabled={approvalLoading}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-b border-owly-border bg-owly-bg px-4 py-3">
                <div className="grid gap-3 xl:grid-cols-3">
                  <section className="rounded-xl border border-owly-border bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-owly-text">
                      <UserRound className="h-4 w-4 text-owly-primary" />
                      Customer profile
                    </div>
                    <div className="space-y-1 text-xs text-owly-text-light">
                      <p>
                        <span className="font-semibold text-owly-text">Name:</span>{" "}
                        {selectedConversation.customer?.name || selectedConversation.customerName}
                      </p>
                      <p>
                        <span className="font-semibold text-owly-text">Email:</span>{" "}
                        {selectedConversation.customer?.email || "--"}
                      </p>
                      <p>
                        <span className="font-semibold text-owly-text">Phone:</span>{" "}
                        {selectedConversation.customer?.phone || selectedConversation.customer?.whatsapp || "--"}
                      </p>
                      <p>
                        <span className="font-semibold text-owly-text">Tags:</span>{" "}
                        {selectedConversation.customer?.tags || "None"}
                      </p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-owly-border bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-owly-text">
                      <FileText className="h-4 w-4 text-owly-primary" />
                      Related tickets
                    </div>
                    <div className="max-h-32 space-y-2 overflow-y-auto">
                      {selectedConversation.tickets?.length ? (
                        selectedConversation.tickets.slice(0, 4).map((ticket) => (
                          <div key={ticket.id} className="rounded-lg bg-owly-surface px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-owly-text">
                                {ticket.title}
                              </span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-owly-text-light">
                                {ticket.status}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-owly-text-light">
                              {ticket.priority} priority
                              {ticket.assignedTo?.name ? ` - ${ticket.assignedTo.name}` : ""}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-owly-text-light">No linked tickets.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-owly-border bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-owly-text">
                      <StickyNote className="h-4 w-4 text-owly-primary" />
                      Internal notes
                    </div>
                    <div className="max-h-24 space-y-2 overflow-y-auto">
                      {selectedConversation.notes?.length ? (
                        selectedConversation.notes.slice(0, 3).map((note) => (
                          <div key={note.id} className="rounded-lg bg-amber-50 px-2 py-1.5">
                            <p className="text-xs text-owly-text">{note.content}</p>
                            <p className="mt-0.5 text-[11px] text-owly-text-light">
                              {note.authorName} - {formatRelativeTime(note.createdAt)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-owly-text-light">No internal notes yet.</p>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder="Add internal note"
                        className="min-w-0 flex-1 rounded-lg border border-owly-border bg-owly-bg px-2 py-1.5 text-xs outline-none focus:border-owly-primary"
                      />
                      <button
                        onClick={handleAddInternalNote}
                        disabled={!noteText.trim() || savingNote}
                        className="rounded-lg bg-owly-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {selectedConversation.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare className="h-8 w-8 text-owly-text-light opacity-40 mb-2" />
                    <p className="text-sm text-owly-text-light">
                      No messages in this conversation yet
                    </p>
                  </div>
                ) : (
                  selectedConversation.messages.map((msg) => {
                    const isAdmin =
                      msg.role === "admin" || msg.role === "assistant";
                    const isSystem = msg.role === "system";
                    const source = getMessageSource(msg);
                    const SourceIcon = source?.icon;

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="px-3 py-1.5 bg-owly-surface border border-owly-border rounded-full text-xs text-owly-text-light">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          isAdmin ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5",
                            isAdmin
                              ? "bg-owly-primary text-white rounded-br-md"
                              : "bg-owly-surface border border-owly-border text-owly-text rounded-bl-md"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={cn(
                                "text-xs font-medium",
                                isAdmin
                                  ? "text-white/80"
                                  : "text-owly-text-light"
                              )}
                            >
                              {isAdmin
                                ? msg.role === "assistant"
                                  ? "AI Assistant"
                                  : "Admin"
                                : selectedConversation.customerName}
                            </span>
                          </div>
                          {source && (
                            <div
                              className={cn(
                                "mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                                source.className
                              )}
                              title={source.detail}
                            >
                              {SourceIcon && <SourceIcon className="h-3 w-3 flex-shrink-0" />}
                              <span>{source.label}</span>
                              <span className="truncate opacity-75">
                                {source.detail}
                              </span>
                            </div>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          <p
                            className={cn(
                              "text-xs mt-1",
                              isAdmin
                                ? "text-white/60"
                                : "text-owly-text-light"
                            )}
                          >
                            {formatRelativeTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className="px-4 py-3 bg-owly-surface border-t border-owly-border">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);
                        if (selectedId) {
                          updatePresence(selectedId, e.target.value ? "typing" : "viewing");
                        }
                      }}
                      onBlur={() => {
                        if (selectedId) updatePresence(selectedId, "viewing");
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                      rows={1}
                      className="w-full px-4 py-2.5 text-sm border border-owly-border rounded-xl bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 focus:border-owly-primary resize-none"
                      style={{
                        minHeight: "42px",
                        maxHeight: "120px",
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "auto";
                        target.style.height =
                          Math.min(target.scrollHeight, 120) + "px";
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                    className={cn(
                      "p-2.5 rounded-xl transition-colors flex-shrink-0",
                      replyText.trim() && !sending
                        ? "bg-owly-primary text-white hover:bg-owly-primary-dark"
                        : "bg-owly-border text-owly-text-light cursor-not-allowed"
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
