// Single source of truth for status/priority/severity/channel colors, used
// by both badges (Tailwind classes) and charts (hex). Before this, the same
// concepts had three independent, inconsistent color definitions: Tailwind
// classes in lib/utils.ts (light-mode only, no dark: variants), a hex map in
// analytics/page.tsx (where "high" priority was brown), and ad-hoc inline
// classes in the module workspace page. Consolidating here is what makes
// "open" the same color in tickets and modules, and "high priority" the same
// color in a badge and in a chart bar.

interface ColorDef {
  hex: string;
  badgeClass: string;
}

const NEUTRAL: ColorDef = {
  hex: "#64748B",
  badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300",
};

export const STATUS_COLORS: Record<string, ColorDef> = {
  active: { hex: "#22C55E", badgeClass: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  open: { hex: "#F59E0B", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  in_progress: { hex: "#F97316", badgeClass: "bg-owly-primary-50 text-owly-primary-dark dark:bg-owly-primary-100 dark:text-owly-primary-light" },
  connected: { hex: "#22C55E", badgeClass: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  resolved: { hex: "#F97316", badgeClass: "bg-owly-primary-50 text-owly-primary-dark dark:bg-owly-primary-100 dark:text-owly-primary-light" },
  snoozed: { hex: "#8B5CF6", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  escalated: { hex: "#EF4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  disconnected: { hex: "#EF4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  error: { hex: "#EF4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  closed: { hex: "#64748B", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
  done: { hex: "#64748B", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
  cancelled: { hex: "#64748B", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
};

export const PRIORITY_COLORS: Record<string, ColorDef> = {
  low: { hex: "#64748B", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
  normal: { hex: "#F59E0B", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  medium: { hex: "#F59E0B", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  high: { hex: "#EA580C", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" },
  urgent: { hex: "#EF4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  critical: { hex: "#EF4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
};

export const SEVERITY_COLORS: Record<string, ColorDef> = PRIORITY_COLORS;

export const CHANNEL_COLORS: Record<string, ColorDef> = {
  whatsapp: { hex: "#22C55E", badgeClass: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  email: { hex: "#F97316", badgeClass: "bg-owly-primary-50 text-owly-primary-dark dark:bg-owly-primary-100 dark:text-owly-primary-light" },
  phone: { hex: "#C4956A", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  sms: { hex: "#C4956A", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  telegram: { hex: "#0EA5E9", badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" },
  web: { hex: "#8B5CF6", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  chat: { hex: "#A8D0E6", badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300" },
  webhook: { hex: "#8B5CF6", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
};

export function getStatusColor(status: string): string {
  return (STATUS_COLORS[status] || NEUTRAL).badgeClass;
}

export function getStatusHex(status: string): string {
  return (STATUS_COLORS[status] || NEUTRAL).hex;
}

export function getPriorityColor(priority: string): string {
  return (PRIORITY_COLORS[priority] || NEUTRAL).badgeClass;
}

export function getPriorityHex(priority: string): string {
  return (PRIORITY_COLORS[priority] || NEUTRAL).hex;
}

export function getSeverityColor(severity: string): string {
  return (SEVERITY_COLORS[severity] || NEUTRAL).badgeClass;
}

export function getChannelColor(channel: string): string {
  return (CHANNEL_COLORS[channel] || NEUTRAL).badgeClass;
}

export function getChannelHex(channel: string): string {
  return (CHANNEL_COLORS[channel] || NEUTRAL).hex;
}
