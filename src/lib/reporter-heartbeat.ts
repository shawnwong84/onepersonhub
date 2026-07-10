import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runReporterAgentScan } from "@/lib/reporter-agent";
import { postReporterMessage } from "@/lib/reporter-chat";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/channels/email";
import { findMarketplaceModule } from "@/lib/marketplace/catalog";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { acquireWorkerTickLock } from "@/lib/worker-lock";

interface HeartbeatConfig {
  heartbeatEnabled: boolean;
  heartbeatMinutes: number;
  notifySeverity: "low" | "medium" | "high" | "urgent" | "critical";
  emailSeverity: "critical";
  emailRecipients: string[];
  quietStartHour: number | null;
  quietEndHour: number | null;
}

const SEVERITY_ORDER = ["low", "medium", "high", "urgent", "critical"];

function severityAtLeast(severity: string, threshold: string): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

function readHeartbeatConfig(raw: unknown): HeartbeatConfig {
  const config = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    heartbeatEnabled: config.heartbeatEnabled !== false,
    heartbeatMinutes: Math.max(5, Number(config.heartbeatMinutes) || 15),
    notifySeverity: (config.notifySeverity as HeartbeatConfig["notifySeverity"]) || "high",
    emailSeverity: "critical",
    emailRecipients: Array.isArray(config.emailRecipients)
      ? config.emailRecipients.filter((r): r is string => typeof r === "string" && r.includes("@"))
      : [],
    quietStartHour: Number.isInteger(config.quietStartHour) ? Number(config.quietStartHour) : null,
    quietEndHour: Number.isInteger(config.quietEndHour) ? Number(config.quietEndHour) : null,
  };
}

function inQuietHours(config: HeartbeatConfig, now: Date): boolean {
  if (config.quietStartHour === null || config.quietEndHour === null) return false;
  const hour = now.getHours();
  if (config.quietStartHour === config.quietEndHour) return false;
  // Window may wrap midnight (e.g. 22 -> 7).
  return config.quietStartHour < config.quietEndHour
    ? hour >= config.quietStartHour && hour < config.quietEndHour
    : hour >= config.quietStartHour || hour < config.quietEndHour;
}

/** All user ids that should hear about a signal in the given module. */
async function recipientsForModules(moduleSlugs: string[]) {
  const [assignments, staff, owners] = await Promise.all([
    prisma.moduleAssignment.findMany({
      where: { moduleSlug: { in: moduleSlugs } },
      select: { teamMemberId: true, moduleSlug: true },
    }),
    prisma.teamMember.findMany({
      where: { rbacRole: { in: ["supervisor", "admin"] }, isActive: true, username: { not: null } },
      select: { id: true },
    }),
    prisma.admin.findMany({ select: { id: true } }),
  ]);

  const perModule = new Map<string, Set<string>>();
  const everyone = new Set<string>();
  const ownerIds = new Set(owners.map((o) => o.id));

  for (const staffMember of staff) everyone.add(staffMember.id);
  for (const owner of owners) everyone.add(owner.id);

  for (const assignment of assignments) {
    if (!perModule.has(assignment.moduleSlug)) perModule.set(assignment.moduleSlug, new Set());
    perModule.get(assignment.moduleSlug)!.add(assignment.teamMemberId);
  }

  return { perModule, everyone, ownerIds };
}

/**
 * One heartbeat: run the scan, find signals created since the last beat,
 * and deliver them to the right people through chat, notifications, and email.
 */
export async function runReporterHeartbeat(force = false) {
  const reporter = await prisma.businessModule.findUnique({ where: { slug: "reporter-agent" } });
  const config = readHeartbeatConfig(reporter?.config);
  const now = new Date();

  if (!force) {
    if (!config.heartbeatEnabled) return { skipped: "disabled" };
    if (inQuietHours(config, now)) return { skipped: "quiet_hours" };
    const metadata = (reporter?.metadata && typeof reporter.metadata === "object" ? reporter.metadata : {}) as Record<string, unknown>;
    const lastBeat = typeof metadata.lastHeartbeatAt === "string" ? Date.parse(metadata.lastHeartbeatAt) : 0;
    if (now.getTime() - lastBeat < config.heartbeatMinutes * 60 * 1000) {
      return { skipped: "not_due" };
    }
  }

  const sinceMetadata = (reporter?.metadata && typeof reporter.metadata === "object" ? reporter.metadata : {}) as Record<string, unknown>;
  const since = typeof sinceMetadata.lastHeartbeatAt === "string"
    ? new Date(sinceMetadata.lastHeartbeatAt)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // The scan itself creates/refreshes signals and report records.
  try {
    await runReporterAgentScan("Reporter Heartbeat");
  } catch (error) {
    logger.error("Heartbeat scan failed:", error);
  }

  // Delta: unresolved signals created since the last beat. The beat timestamp
  // recorded below must postdate the scan, or these same signals would be
  // re-reported on the next run.
  const beatCompletedAt = new Date();
  const newSignals = await prisma.moduleSignal.findMany({
    where: { status: { not: "resolved" }, createdAt: { gt: since, lte: beatCompletedAt } },
    orderBy: { severity: "desc" },
    take: 30,
    include: { module: { select: { slug: true, name: true } } },
  });

  let delivered = 0;
  if (newSignals.length > 0) {
    const moduleSlugs = Array.from(new Set(newSignals.map((s) => s.module.slug)));
    const { perModule, everyone, ownerIds } = await recipientsForModules(moduleSlugs);

    // Group signals per recipient.
    const perUser = new Map<string, typeof newSignals>();
    for (const signal of newSignals) {
      const targets = new Set<string>([
        ...everyone,
        ...(perModule.get(signal.module.slug) || []),
      ]);
      for (const userId of targets) {
        if (!perUser.has(userId)) perUser.set(userId, []);
        perUser.get(userId)!.push(signal);
      }
    }

    for (const [userId, signals] of perUser) {
      const lines = signals.map(
        (s) => `- ${s.severity.toUpperCase()} [${s.module.name}] ${s.title}${s.description ? `: ${s.description}` : ""}`
      );
      const content = `Heartbeat check found ${signals.length} new item${signals.length > 1 ? "s" : ""} needing attention:\n${lines.join("\n")}\n\nOpen /reporter to investigate or ask me about any of these.`;
      try {
        await postReporterMessage(userId, ownerIds.has(userId) ? "owner" : "member", content, {
          signalIds: signals.map((s) => s.id),
          heartbeat: true,
        });
        delivered += 1;
      } catch (error) {
        logger.error("Heartbeat chat delivery failed:", error);
      }
    }

    // In-app notifications for high+ severity.
    const notifiable = newSignals.filter((s) => severityAtLeast(s.severity, config.notifySeverity));
    for (const signal of notifiable) {
      await createNotification({
        type: "reporter_signal",
        title: `${signal.module.name}: ${signal.title}`,
        message: signal.description || signal.signalType,
        priority: signal.severity === "critical" || signal.severity === "urgent" ? "urgent" : "high",
        href: `/modules/${signal.module.slug}`,
        metadata: { signalId: signal.id, severity: signal.severity, heartbeat: true },
      });
    }

    // Email for critical only.
    const critical = newSignals.filter((s) => severityAtLeast(s.severity, config.emailSeverity));
    if (critical.length > 0 && config.emailRecipients.length > 0) {
      const body = critical
        .map((s) => `${s.severity.toUpperCase()} [${s.module.name}] ${s.title}\n${s.description || s.signalType}`)
        .join("\n\n");
      for (const recipient of config.emailRecipients) {
        try {
          await sendEmail(recipient, `[Cosstigo] ${critical.length} critical alert${critical.length > 1 ? "s" : ""}`, body);
        } catch (error) {
          logger.error("Heartbeat email delivery failed:", error);
        }
      }
    }
  }

  // Record the beat.
  const catalog = findMarketplaceModule("reporter-agent");
  await prisma.businessModule.upsert({
    where: { slug: "reporter-agent" },
    create: {
      slug: "reporter-agent",
      name: catalog?.name || "Reporter Agent",
      category: catalog?.category || "Monitoring and reporting",
      description: catalog?.description || "",
      version: catalog?.version || "0.1.0",
      isInstalled: true,
      isEnabled: true,
      metadata: { lastHeartbeatAt: beatCompletedAt.toISOString() },
    },
    update: {
      metadata: {
        ...sinceMetadata,
        lastHeartbeatAt: beatCompletedAt.toISOString(),
      },
    },
  });

  await logActivity({
    action: "reporter.heartbeat_ran",
    entity: ACTIVITY_ENTITIES.AGENT,
    entityId: "reporter-agent",
    description: `Reporter heartbeat ran: ${newSignals.length} new signal(s), ${delivered} chat deliveries.`,
    metadata: { newSignals: newSignals.length, delivered, since: since.toISOString() },
  });

  return { newSignals: newSignals.length, delivered };
}

const globalForHeartbeat = globalThis as unknown as { reporterHeartbeatTimer?: NodeJS.Timeout };

/** Started once from instrumentation; checks every minute whether a beat is due. */
export function startReporterHeartbeat() {
  if (globalForHeartbeat.reporterHeartbeatTimer) return;
  globalForHeartbeat.reporterHeartbeatTimer = setInterval(async () => {
    if (!(await acquireWorkerTickLock("reporter-heartbeat", 50 * 1000))) return;
    runReporterHeartbeat().catch((error) => logger.error("Reporter heartbeat failed:", error));
  }, 60 * 1000);
  logger.info("Reporter heartbeat scheduler started.");
}
