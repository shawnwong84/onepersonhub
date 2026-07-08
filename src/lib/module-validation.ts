import type { MarketplaceModule } from "@/lib/marketplace/catalog";

const STATUSES = new Set(["open", "draft", "pending", "pending_approval", "in_progress", "confirmed", "fulfilled", "completed", "cancelled", "closed", "resolved"]);
const PRIORITIES = new Set(["low", "normal", "medium", "high", "urgent"]);
const REPORTER_STATES = new Set(["normal", "watch", "attention", "blocked", "resolved"]);
const SEVERITIES = new Set(["low", "medium", "high", "urgent", "critical"]);
const SIGNAL_STATUSES = new Set(["open", "acknowledged", "resolved", "dismissed"]);

function normalizeRecordName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function validateModuleRecordInput(
  catalog: MarketplaceModule,
  input: {
    recordType: string;
    title: string;
    status?: string;
    priority?: string;
    reporterState?: string;
    data?: unknown;
  }
) {
  const errors: string[] = [];
  const recordType = input.recordType.trim();
  const allowedTypes = new Set(catalog.records.map(normalizeRecordName));

  if (!recordType) errors.push("recordType is required");
  if (recordType && allowedTypes.size > 0 && !allowedTypes.has(normalizeRecordName(recordType))) {
    errors.push(`recordType must be one of: ${catalog.records.join(", ")}`);
  }
  if (!input.title.trim()) errors.push("title is required");
  if (input.status && !STATUSES.has(input.status)) errors.push(`status "${input.status}" is not supported`);
  if (input.priority && !PRIORITIES.has(input.priority)) errors.push(`priority "${input.priority}" is not supported`);
  if (input.reporterState && !REPORTER_STATES.has(input.reporterState)) {
    errors.push(`reporterState "${input.reporterState}" is not supported`);
  }
  if (input.data !== undefined && (!input.data || typeof input.data !== "object" || Array.isArray(input.data))) {
    errors.push("data must be a JSON object");
  }

  return { valid: errors.length === 0, errors };
}

export function validateModuleSignalInput(input: {
  moduleSlug: string;
  signalType: string;
  title: string;
  severity?: string;
  status?: string;
  metadata?: unknown;
}) {
  const errors: string[] = [];
  if (!input.moduleSlug.trim()) errors.push("moduleSlug is required");
  if (!input.signalType.trim()) errors.push("signalType is required");
  if (!input.title.trim()) errors.push("title is required");
  if (input.severity && !SEVERITIES.has(input.severity)) errors.push(`severity "${input.severity}" is not supported`);
  if (input.status && !SIGNAL_STATUSES.has(input.status)) errors.push(`status "${input.status}" is not supported`);
  if (input.metadata !== undefined && (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata))) {
    errors.push("metadata must be a JSON object");
  }

  return { valid: errors.length === 0, errors };
}
