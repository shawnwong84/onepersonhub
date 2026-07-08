import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Factory,
  FileText,
  Headphones,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

export type MarketplaceModuleCategory =
  | "Customer operations"
  | "Sales"
  | "Orders"
  | "Inventory"
  | "Finance"
  | "Supplier"
  | "HR"
  | "Procurement"
  | "Field service"
  | "Productivity"
  | "Monitoring and reporting";

export interface MarketplaceModule {
  slug: string;
  name: string;
  category: MarketplaceModuleCategory;
  description: string;
  longDescription: string;
  iconName: string;
  channels: string[];
  workflows: string[];
  records: string[];
  approvals: string[];
  reporterSignals: string[];
  examples: string[];
  isInstalled: boolean;
  isEnabled: boolean;
  version: string;
}

export const MARKETPLACE_MODULES: MarketplaceModule[] = [
  {
    slug: "customer-care",
    name: "Customer Care",
    category: "Customer operations",
    description: "Turn inbound WhatsApp and email questions into replies, tickets, approvals, and follow-ups.",
    longDescription:
      "Core support automation for teams that receive customer issues through Email and WhatsApp. It routes messages to the right agent, uses scoped KB, creates tickets, and pauses for approval when policy requires human review.",
    iconName: "Headphones",
    channels: ["Email", "WhatsApp"],
    workflows: ["Auto reply", "Escalation", "Human approval", "Ticket close update"],
    records: ["Conversation", "Ticket", "Customer profile", "Activity event"],
    approvals: ["Refund replies", "Sensitive account requests", "Manual takeover"],
    reporterSignals: ["SLA risk", "Repeated urgent messages", "Failed reply delivery"],
    examples: [
      "Customer asks for password reset by WhatsApp and receives a safe acknowledgement.",
      "Email complaint creates a ticket and assigns a support agent.",
    ],
    isInstalled: true,
    isEnabled: true,
    version: "1.0.0",
  },
  {
    slug: "orders",
    name: "Orders",
    category: "Orders",
    description: "Extract purchase intent from messages and create draft sales orders for review.",
    longDescription:
      "Reads customer order emails, WhatsApp purchase requests, and repeat-order messages. The module creates structured order records, detects missing information, requests approval for high-value orders, and replies with confirmation once approved.",
    iconName: "ShoppingCart",
    channels: ["Email", "WhatsApp"],
    workflows: ["Order intake", "Missing info request", "Order approval", "Order confirmation"],
    records: ["Order", "Order line", "Customer", "Payment term"],
    approvals: ["High-value order", "Discount request", "Out-of-stock substitution"],
    reporterSignals: ["Order waiting approval", "Order blocked by stock", "Customer asked for unavailable product"],
    examples: [
      "Email says 'send 20 cartons of SKU A' and creates a draft order.",
      "WhatsApp order missing delivery date triggers a clarification reply.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "products",
    name: "Products",
    category: "Inventory",
    description: "Maintain product, pricing, and SKU knowledge for automation and quoting.",
    longDescription:
      "Central product catalog used by agents, workflows, and RAG. It parses product sheets, customer SKU references, price questions, and discontinued-item requests so replies and orders use the right structured data.",
    iconName: "Package",
    channels: ["Email", "WhatsApp", "Document upload"],
    workflows: ["Product lookup", "Pricing question", "Discontinued item handling"],
    records: ["Product", "SKU", "Price list", "Product document"],
    approvals: ["Price override", "Discontinued product substitution"],
    reporterSignals: ["Missing SKU mapping", "Price mismatch", "Frequently requested unavailable product"],
    examples: [
      "Customer asks for a product code and the agent answers from the product KB.",
      "Uploaded price list updates searchable product knowledge.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "inventory-warehouse",
    name: "Inventory and Warehouse",
    category: "Inventory",
    description: "Monitor stock, warehouse movements, and low-stock risks from operational messages.",
    longDescription:
      "Tracks stock levels and warehouse exceptions. It can read supplier delivery emails, stock count messages, and packing issues, then update inventory records or alert the Reporter Agent when an order depends on low stock.",
    iconName: "Warehouse",
    channels: ["Email", "WhatsApp"],
    workflows: ["Stock update", "Low-stock alert", "Warehouse exception", "Order stock check"],
    records: ["Stock item", "Warehouse", "Movement", "Stock alert"],
    approvals: ["Manual stock adjustment", "Emergency reorder"],
    reporterSignals: ["Low stock with open order demand", "Negative stock", "Late inbound shipment"],
    examples: [
      "Warehouse WhatsApp says 'SKU A balance 4' and updates stock.",
      "Reporter Agent flags a pending order that needs a low-stock item.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "supplier-management",
    name: "Supplier Management",
    category: "Supplier",
    description: "Track supplier quotes, delivery updates, delays, and follow-up commitments.",
    longDescription:
      "Converts supplier email and WhatsApp replies into supplier records, quote comparisons, delivery ETAs, and escalation tasks. Useful for SMEs that coordinate purchasing through unstructured supplier chats.",
    iconName: "Truck",
    channels: ["Email", "WhatsApp"],
    workflows: ["Supplier quote intake", "Delivery delay", "ETA update", "Supplier follow-up"],
    records: ["Supplier", "Quote", "Delivery update", "Follow-up task"],
    approvals: ["Supplier quote selection", "Late delivery customer notice"],
    reporterSignals: ["Supplier delay affects order", "Quote pending too long", "Missing ETA"],
    examples: [
      "Supplier replies with a new ETA and linked customer order is updated.",
      "Three quote emails are turned into comparable quote records.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "finance-billing",
    name: "Finance and Billing",
    category: "Finance",
    description: "Handle invoice questions, payment proof, overdue reminders, and finance approvals.",
    longDescription:
      "Routes billing emails to a finance agent, extracts invoice numbers and payment evidence, creates finance tasks, and prevents support agents from replying to sensitive finance requests without approval.",
    iconName: "FileText",
    channels: ["Email", "WhatsApp"],
    workflows: ["Invoice question", "Payment proof intake", "Overdue reminder", "Refund approval"],
    records: ["Invoice case", "Payment proof", "Credit note request"],
    approvals: ["Refund", "Credit note", "Payment dispute reply"],
    reporterSignals: ["Unmatched payment proof", "Overdue account with active order", "Refund pending approval"],
    examples: [
      "Customer emails payment proof and the module creates a verification task.",
      "Refund request pauses for finance approval before customer reply.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "sales-crm",
    name: "Sales CRM",
    category: "Sales",
    description: "Capture leads, qualify enquiries, and create follow-up workflows from inbound messages.",
    longDescription:
      "Turns inbound product enquiries into leads and deals. It can qualify intent, assign sales owners, draft responses, and follow up when a customer goes quiet.",
    iconName: "BriefcaseBusiness",
    channels: ["Email", "WhatsApp", "Website form"],
    workflows: ["Lead capture", "Qualification", "Quote follow-up", "Deal stage update"],
    records: ["Lead", "Deal", "Company", "Follow-up task"],
    approvals: ["Discount quote", "Non-standard term"],
    reporterSignals: ["Hot lead waiting reply", "Deal stuck", "Quote requested but not sent"],
    examples: [
      "Email enquiry creates a lead and asks missing budget questions.",
      "WhatsApp quote request is routed to the sales agent.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "procurement",
    name: "Procurement",
    category: "Procurement",
    description: "Convert internal purchase requests and supplier quotes into approval-ready procurement records.",
    longDescription:
      "Reads internal email requests, compares supplier quotes, and sends approval requests before purchase orders are confirmed. It links procurement to inventory and order demand.",
    iconName: "ClipboardList",
    channels: ["Email", "WhatsApp"],
    workflows: ["Purchase request", "Quote comparison", "PO approval", "Supplier confirmation"],
    records: ["Purchase request", "Purchase order", "Quote comparison"],
    approvals: ["Purchase order", "Budget exception", "Preferred supplier override"],
    reporterSignals: ["PO waiting approval", "Purchase needed for low stock", "Supplier quote expiring"],
    examples: [
      "Manager emails a purchase request and it becomes an approval item.",
      "Low stock triggers a suggested purchase order.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "hr-recruitment",
    name: "HR and Recruitment",
    category: "HR",
    description: "Process candidate emails, interview requests, leave notices, and HR follow-ups.",
    longDescription:
      "Routes HR emails away from general support, extracts candidate information, schedules interview follow-ups, and turns internal HR messages into tasks without mixing them with customer support.",
    iconName: "Users",
    channels: ["Email", "WhatsApp"],
    workflows: ["Candidate intake", "Interview follow-up", "Leave notice", "HR document request"],
    records: ["Candidate", "HR task", "Interview follow-up"],
    approvals: ["Offer letter", "Sensitive HR reply"],
    reporterSignals: ["Candidate waiting too long", "Missing document", "HR reply pending approval"],
    examples: [
      "Candidate email creates a candidate record and follow-up task.",
      "Internal leave request is routed to HR instead of customer support.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "field-service",
    name: "Field Service",
    category: "Field service",
    description: "Create service jobs and technician follow-ups from customer issue messages.",
    longDescription:
      "Converts support messages into field service jobs, collects photos and site information, assigns technicians, and sends appointment confirmations after approval.",
    iconName: "Factory",
    channels: ["Email", "WhatsApp"],
    workflows: ["Service job intake", "Technician assignment", "Appointment confirmation", "Job completion reply"],
    records: ["Service job", "Technician task", "Site contact"],
    approvals: ["Chargeable visit", "Warranty exception", "Appointment confirmation"],
    reporterSignals: ["Job overdue", "Technician unassigned", "Repeated issue at same site"],
    examples: [
      "Customer WhatsApp photo creates a service job.",
      "Completed job triggers a customer update.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "office-productivity",
    name: "Office Productivity",
    category: "Productivity",
    description: "Turn inbound office requests into tasks, approvals, summaries, and follow-ups.",
    longDescription:
      "Handles general office administration that arrives through email or chat: document requests, meeting follow-ups, internal reminders, status summaries, and task creation. It keeps productivity automation tied to traceable inbound messages.",
    iconName: "ClipboardList",
    channels: ["Email", "WhatsApp"],
    workflows: ["Task intake", "Meeting follow-up", "Document request", "Internal reminder"],
    records: ["Task", "Reminder", "Document request", "Meeting note"],
    approvals: ["External document sharing", "Customer-facing summary"],
    reporterSignals: ["Task overdue", "Document request waiting", "Unanswered internal follow-up"],
    examples: [
      "Email asks for a document and creates a tracked document request.",
      "WhatsApp reminder creates an internal task and notification.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
  {
    slug: "reporter-agent",
    name: "Reporter Agent",
    category: "Monitoring and reporting",
    description: "LLM monitor that scans modules for items needing attention and reports them proactively.",
    longDescription:
      "A cross-module monitoring agent that reviews signals from orders, stock, suppliers, tickets, finance, and workflows. It explains what needs attention, why it matters, and which records are affected.",
    iconName: "BarChart3",
    channels: ["Internal notifications", "Email digest"],
    workflows: ["Daily attention report", "Critical alert", "Cross-module risk summary"],
    records: ["Report", "Alert", "Recommendation", "Resolved signal"],
    approvals: ["External escalation", "Customer-facing report"],
    reporterSignals: ["Low stock needed by order", "Supplier delay affects customer", "High-priority ticket aging"],
    examples: [
      "Low stock is detected while an open order needs the product.",
      "Supplier delay triggers an internal alert before customer SLA breach.",
    ],
    isInstalled: false,
    isEnabled: false,
    version: "0.1.0",
  },
];

export const MARKETPLACE_CATEGORIES = Array.from(
  new Set(MARKETPLACE_MODULES.map((module) => module.category))
);

export function findMarketplaceModule(slug: string) {
  return MARKETPLACE_MODULES.find((module) => module.slug === slug);
}

export const MARKETPLACE_ICONS = {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Factory,
  FileText,
  Headphones,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} as const;
