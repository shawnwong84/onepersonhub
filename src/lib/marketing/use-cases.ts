import { MessageCircle, ShoppingCart, Wrench, Warehouse, type LucideIcon } from "lucide-react";

export interface UseCaseProfile {
  slug: string;
  icon: LucideIcon;
  title: string;
  body: string;
  fits: string[];
}

export const USE_CASE_PROFILES: UseCaseProfile[] = [
  {
    slug: "support-teams",
    icon: MessageCircle,
    title: "Solo and small support teams",
    body: "One or two people can't watch WhatsApp and email all day. Customer Care and the Reporter Agent watch both for you, out of the box, free.",
    fits: ["Channels", "AI agents", "Knowledge base"],
  },
  {
    slug: "ecommerce",
    icon: ShoppingCart,
    title: "E-commerce and order operations",
    body: "Paperhuman watches inbound order messages, drafts the record, and escalates for approval before anything ships.",
    fits: ["Orders", "Sales CRM", "Workflows"],
  },
  {
    slug: "inventory",
    icon: Warehouse,
    title: "Inventory-heavy small businesses",
    body: "Paperhuman watches stock levels so you know before a customer asks about it.",
    fits: ["Inventory and Warehouse", "Reporter Agent", "Procurement"],
  },
  {
    slug: "field-service",
    icon: Wrench,
    title: "Field service and appointments",
    body: "Paperhuman watches job bookings over phone and WhatsApp, and escalates dispatch decisions to the right person.",
    fits: ["Field Service", "Automation", "Team & security"],
  },
];
