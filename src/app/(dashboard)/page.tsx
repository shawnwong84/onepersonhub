import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { LineChart, DonutChart, BarChart } from "@/components/ui/chart";
import { OnboardingChecklist } from "@/components/ui/onboarding-checklist";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { setCurrentCompany } from "@/lib/tenant-context";
import { isUnscoped, conversationScope, ticketScope, type ScopedUser } from "@/lib/rbac-scope";
import { LandingPage } from "@/components/marketing/landing-page";
import Link from "next/link";
import {
  MessageSquare,
  Ticket,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { formatRelativeTime, getChannelLabel, getStatusColor } from "@/lib/utils";
import { getChannelHex, getPriorityHex } from "@/lib/status-colors";

// This route is dual-purpose: anonymous visitors get the marketing landing
// page (see below), authenticated users get the dashboard. This metadata
// only matters for the anonymous/landing case - authenticated pages aren't
// meant to be indexed or shared anyway.
export const metadata: Metadata = {
  title: "Paperhuman - AI Customer Care & Business Automation",
  description:
    "Turn WhatsApp, email, and phone messages into AI replies, visual workflows, and business records, with a Reporter Agent that watches for what needs attention.",
  openGraph: {
    title: "Paperhuman - AI Customer Care & Business Automation",
    description:
      "Turn WhatsApp, email, and phone messages into AI replies, visual workflows, and business records.",
    url: "/",
    type: "website",
  },
};

const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CHART_WINDOW_DAYS = 14;

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatChartLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Trend {
  change: string;
  changeType: "positive" | "negative" | "neutral";
}

// Percentage change reads as nonsense against a zero baseline ("+infinity%");
// fall back to a plain count in that case instead.
function computeTrend(current: number, previous: number, noun: string): Trend {
  if (previous === 0) {
    if (current === 0) return { change: `No ${noun} yet`, changeType: "neutral" };
    return { change: `+${current} new`, changeType: "positive" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { change: "No change vs last week", changeType: "neutral" };
  return {
    change: `${pct > 0 ? "+" : ""}${pct}% vs last week`,
    changeType: pct > 0 ? "positive" : "negative",
  };
}

// Rates compare as percentage-point deltas, not a percent-of-a-percent -
// a 10% -> 15% rate is "+5pp", not the more confusing "+50%".
function computeRateTrend(currentRate: number, previousRate: number): Trend {
  const delta = currentRate - previousRate;
  if (delta === 0) return { change: "No change vs last week", changeType: "neutral" };
  return {
    change: `${delta > 0 ? "+" : ""}${delta}pp vs last week`,
    changeType: delta > 0 ? "positive" : "negative",
  };
}

async function getStats(user: ScopedUser) {
  const scoped = await conversationScope(user);
  const ticketScoped = await ticketScope(user);
  const now = new Date();
  const periodStart = new Date(now.getTime() - TREND_WINDOW_MS);
  const prevPeriodStart = new Date(now.getTime() - 2 * TREND_WINDOW_MS);
  const chartWindowStart = new Date(now.getTime() - CHART_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    totalConversations,
    activeConversations,
    totalTickets,
    openTickets,
    totalMessages,
    recentConversations,
    channels,
    newConversationsThisPeriod,
    newConversationsPrevPeriod,
    newTicketsThisPeriod,
    newTicketsPrevPeriod,
    resolvedThisPeriod,
    createdThisPeriodForRate,
    resolvedPrevPeriod,
    createdPrevPeriodForRate,
    chartWindowConversations,
    openTicketsByPriority,
  ] = await Promise.all([
    prisma.conversation.count({ where: scoped }),
    prisma.conversation.count({ where: { ...scoped, status: "active" } }),
    prisma.ticket.count({ where: ticketScoped }),
    prisma.ticket.count({ where: { ...ticketScoped, status: "open" } }),
    (await isUnscoped(user))
      ? prisma.message.count()
      : prisma.message.count({ where: { conversation: scoped } }),
    prisma.conversation.findMany({
      where: scoped,
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { take: 1, orderBy: { createdAt: "desc" } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.channel.findMany({
      where: { type: { in: ["whatsapp", "email", "phone"] } },
      select: { type: true, isActive: true, status: true },
    }),
    prisma.conversation.count({ where: { ...scoped, createdAt: { gte: periodStart } } }),
    prisma.conversation.count({
      where: { ...scoped, createdAt: { gte: prevPeriodStart, lt: periodStart } },
    }),
    prisma.ticket.count({ where: { ...ticketScoped, createdAt: { gte: periodStart } } }),
    prisma.ticket.count({
      where: { ...ticketScoped, createdAt: { gte: prevPeriodStart, lt: periodStart } },
    }),
    prisma.conversation.count({
      where: { ...scoped, status: "resolved", createdAt: { gte: periodStart } },
    }),
    prisma.conversation.count({ where: { ...scoped, createdAt: { gte: periodStart } } }),
    prisma.conversation.count({
      where: {
        ...scoped,
        status: "resolved",
        createdAt: { gte: prevPeriodStart, lt: periodStart },
      },
    }),
    prisma.conversation.count({
      where: { ...scoped, createdAt: { gte: prevPeriodStart, lt: periodStart } },
    }),
    // Chart data - fetched raw and bucketed in JS below, matching the
    // existing /api/analytics route's convention (no raw SQL grouping).
    prisma.conversation.findMany({
      where: { ...scoped, createdAt: { gte: chartWindowStart } },
      select: { createdAt: true, channel: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { ...ticketScoped, status: "open" },
      _count: { id: true },
    }),
  ]);

  // -- Conversations per day (last 14 days) --
  const dayMap = new Map<string, number>();
  for (let i = 0; i < CHART_WINDOW_DAYS; i++) {
    const d = new Date(chartWindowStart.getTime() + i * 24 * 60 * 60 * 1000);
    dayMap.set(formatDateKey(d), 0);
  }
  for (const c of chartWindowConversations) {
    const key = formatDateKey(new Date(c.createdAt));
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) || 0) + 1);
  }
  const conversationsOverTime = Array.from(dayMap.entries()).map(([date, count]) => ({
    label: formatChartLabel(date),
    value: count,
  }));

  // -- Channel breakdown (same 14-day window) --
  const channelCounts = new Map<string, number>();
  for (const c of chartWindowConversations) {
    channelCounts.set(c.channel, (channelCounts.get(c.channel) || 0) + 1);
  }
  const channelBreakdown = Array.from(channelCounts.entries()).map(([channel, count]) => ({
    label: capitalizeFirst(channel),
    value: count,
    color: getChannelHex(channel),
  }));

  // -- Open tickets by priority (current workload, not time-boxed) --
  const ticketsByPriority = openTicketsByPriority.map((g) => ({
    label: capitalizeFirst(g.priority),
    value: g._count.id,
    color: getPriorityHex(g.priority),
  }));

  const resolvedConversations = await prisma.conversation.count({
    where: { ...scoped, status: "resolved" },
  });

  const resolutionRate =
    totalConversations > 0
      ? Math.round((resolvedConversations / totalConversations) * 100)
      : 0;

  const rateThisPeriod =
    createdThisPeriodForRate > 0
      ? Math.round((resolvedThisPeriod / createdThisPeriodForRate) * 100)
      : 0;
  const ratePrevPeriod =
    createdPrevPeriodForRate > 0
      ? Math.round((resolvedPrevPeriod / createdPrevPeriodForRate) * 100)
      : 0;

  return {
    totalConversations,
    activeConversations,
    totalTickets,
    openTickets,
    totalMessages,
    resolutionRate,
    recentConversations,
    channels,
    conversationsOverTime,
    channelBreakdown,
    ticketsByPriority,
    trends: {
      conversations: computeTrend(
        newConversationsThisPeriod,
        newConversationsPrevPeriod,
        "new conversations"
      ),
      tickets: computeTrend(newTicketsThisPeriod, newTicketsPrevPeriod, "new tickets"),
      resolutionRate:
        createdThisPeriodForRate === 0 && createdPrevPeriodForRate === 0
          ? ({ change: "No data yet", changeType: "neutral" } as Trend)
          : computeRateTrend(rateThisPeriod, ratePrevPeriod),
    },
  };
}

const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
};

function previewMessage(content: string, channel: string, maxLength = 96) {
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

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return <LandingPage />;

  // Server Component pages can render independently of their layout (Next.js
  // does not guarantee the layout's setCurrentCompany() side effect runs
  // first), so this page re-affirms its own tenant context rather than
  // relying solely on (dashboard)/layout.tsx having set it.
  setCurrentCompany(currentUser.companyId);

  const scopedUser: ScopedUser = {
    userId: currentUser.id,
    companyId: currentUser.companyId,
    role: currentUser.role,
    userType: currentUser.userType,
  };
  const scoped = !(await isUnscoped(scopedUser));

  const stats = await getStats(scopedUser);
  const channelStatusByType = new Map(
    stats.channels.map((channel) => [channel.type, channel])
  );
  const overviewChannels = [
    {
      type: "whatsapp",
      name: "WhatsApp",
      icon: MessageCircle,
      color: "text-green-600",
    },
    { type: "email", name: "Email", icon: Mail, color: "text-blue-600" },
    { type: "phone", name: "Phone", icon: Phone, color: "text-purple-600" },
  ];

  return (
    <>
      <Header
        title="Dashboard"
        description={
          scoped
            ? "Overview of your assigned conversations and tickets"
            : "Overview of your customer support activity"
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <OnboardingChecklist />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={scoped ? "My Conversations" : "Total Conversations"}
            value={stats.totalConversations}
            change={stats.trends.conversations.change}
            changeType={stats.trends.conversations.changeType}
            icon={MessageSquare}
          />
          <StatCard
            title="Active Now"
            value={stats.activeConversations}
            icon={Clock}
            iconColor="bg-green-50 text-green-600"
          />
          <StatCard
            title={scoped ? "My Open Tickets" : "Open Tickets"}
            value={stats.openTickets}
            change={stats.trends.tickets.change}
            changeType={stats.trends.tickets.changeType}
            icon={Ticket}
            iconColor="bg-orange-50 text-orange-600"
          />
          <StatCard
            title="Resolution Rate"
            value={stats.totalConversations === 0 ? "No data yet" : `${stats.resolutionRate}%`}
            change={stats.totalConversations === 0 ? undefined : stats.trends.resolutionRate.change}
            changeType={stats.trends.resolutionRate.changeType}
            icon={CheckCircle}
            iconColor="bg-blue-50 text-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-owly-surface rounded-xl border border-owly-border p-5">
            <LineChart
              title={scoped ? "My Conversations Over Time" : "Conversations Over Time"}
              data={stats.conversationsOverTime}
              height={240}
            />
          </div>
          <div className="bg-owly-surface rounded-xl border border-owly-border p-5">
            {stats.channelBreakdown.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-owly-text-light">
                <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No conversations in the last 14 days</p>
              </div>
            ) : (
              <DonutChart title="Channel Breakdown" data={stats.channelBreakdown} height={240} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-owly-surface rounded-xl border border-owly-border">
            <div className="px-5 py-4 border-b border-owly-border">
              <h3 className="font-semibold text-owly-text">
                {scoped ? "My Recent Conversations" : "Recent Conversations"}
              </h3>
            </div>
            <div className="divide-y divide-owly-border p-5">
              {stats.recentConversations.length === 0 ? (
                <div className="px-5 py-12 text-center text-owly-text-light">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">
                    {scoped ? "No conversations assigned to you yet" : "No conversations yet"}
                  </p>
                  <p className="text-sm mt-1">
                    {scoped
                      ? "Conversations will appear here once one is assigned to you"
                      : "Conversations will appear here once customers start reaching out"}
                  </p>
                </div>
              ) : (
                stats.recentConversations.map((conv) => {
                  const ChannelIcon =
                    channelIcons[conv.channel] || MessageSquare;
                  const lastMessage = conv.messages[0];
                  return (
                    <Link
                      key={conv.id}
                      href={`/conversations?conversationId=${conv.id}`}
                      prefetch={false}
                      className="block py-3.5 hover:bg-owly-primary-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-owly-primary-50 text-owly-primary mt-0.5">
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
                          <p className="text-xs text-owly-text-light mt-0.5">
                            {getChannelLabel(conv.channel)} -{" "}
                            {conv._count.messages} messages
                          </p>
                          {lastMessage && (
                            <p className="text-sm text-owly-text-light mt-1 truncate">
                              {previewMessage(lastMessage.content, conv.channel)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(conv.status)}`}
                        >
                          {conv.status}
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            {stats.ticketsByPriority.length > 0 && (
              <div className="bg-owly-surface rounded-xl border border-owly-border p-5">
                <BarChart
                  title={scoped ? "My Open Tickets by Priority" : "Open Tickets by Priority"}
                  data={stats.ticketsByPriority}
                  height={160}
                />
              </div>
            )}

            <div className="bg-owly-surface rounded-xl border border-owly-border">
              <div className="px-5 py-4 border-b border-owly-border">
                <h3 className="font-semibold text-owly-text">
                  Channel Overview
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {overviewChannels.map((channel) => {
                  const status = channelStatusByType.get(channel.type);
                  const isConnected =
                    status?.isActive && status.status === "connected";

                  return (
                    <div
                      key={channel.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <channel.icon
                          className={`h-4 w-4 ${channel.color}`}
                        />
                        <span className="text-sm font-medium">
                          {channel.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isConnected
                            ? "bg-green-50 text-green-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {isConnected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-owly-surface rounded-xl border border-owly-border">
              <div className="px-5 py-4 border-b border-owly-border">
                <h3 className="font-semibold text-owly-text">Quick Stats</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">
                    {scoped ? "My Messages" : "Total Messages"}
                  </span>
                  <span className="font-medium">{stats.totalMessages}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">
                    {scoped ? "My Tickets" : "Total Tickets"}
                  </span>
                  <span className="font-medium">{stats.totalTickets}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-owly-text-light">
                    Avg. Resolution Rate
                  </span>
                  <span className="font-medium">
                    {stats.totalConversations === 0 ? "No data yet" : `${stats.resolutionRate}%`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
