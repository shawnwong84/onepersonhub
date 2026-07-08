export interface WorkspaceField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
}

export interface WorkspaceAction {
  label: string;
  from: string[];
  to: string;
  tone: "primary" | "success" | "danger";
}

export interface WorkspaceRowAlert {
  label: string;
  applies: (data: Record<string, unknown>) => boolean;
}

export interface WorkspaceCustomerReply {
  label: string;
  availableWhen: string[];
  buildMessage: (record: { title: string; data: Record<string, unknown> }) => string;
}

export interface ModuleWorkspaceConfig {
  title: string;
  description: string;
  recordTypes: { value: string; label: string }[];
  statuses: string[];
  fields: WorkspaceField[];
  /** Field keys shown as table columns in the record list. */
  listColumns: string[];
  /** Status transitions offered as one-click buttons on records. */
  actions: WorkspaceAction[];
  /** Data key holding order-line style items rendered as a table on the detail page. */
  lineItemsKey?: string;
  /** Select-field key that drives an optional kanban board view of the record list. */
  boardField?: string;
  /** Highlights records needing attention (low stock, overdue invoice) in the list. */
  rowAlert?: WorkspaceRowAlert;
  /** One-click reply sent to the source conversation, offered at the given statuses. */
  customerReply?: WorkspaceCustomerReply;
}

const DEFAULT_STATUSES = ["open", "draft", "pending", "in_progress", "completed", "closed"];

const DEFAULT_ACTIONS: WorkspaceAction[] = [
  { label: "Start", from: ["open", "draft", "pending"], to: "in_progress", tone: "primary" },
  { label: "Complete", from: ["in_progress"], to: "completed", tone: "success" },
  { label: "Close", from: ["completed"], to: "closed", tone: "success" },
];

export const MODULE_WORKSPACES: Record<string, ModuleWorkspaceConfig> = {
  "customer-care": {
    title: "Customer Care workspace",
    description: "Track support cases, escalations, and follow-ups created from Email and WhatsApp conversations.",
    recordTypes: [
      { value: "conversation", label: "Conversation" },
      { value: "ticket", label: "Ticket" },
      { value: "customer_profile", label: "Customer profile" },
      { value: "activity_event", label: "Activity event" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "customer", label: "Customer", type: "text" },
      { key: "channel", label: "Channel", type: "select", options: ["email", "whatsapp", "other"] },
      { key: "issueType", label: "Issue type", type: "text", placeholder: "complaint, question, request..." },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "resolution", label: "Resolution", type: "textarea" },
    ],
    listColumns: ["customer", "channel", "issueType"],
    actions: [
      { label: "Start working", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Resolve", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close case", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  orders: {
    title: "Orders workspace",
    description: "Review order requests extracted from Email and WhatsApp, approve risky orders, and confirm next steps.",
    recordTypes: [
      { value: "order", label: "Order" },
      { value: "order_line", label: "Order line" },
      { value: "customer", label: "Customer" },
      { value: "payment_term", label: "Payment term" },
    ],
    statuses: ["draft", "pending_approval", "confirmed", "fulfilled", "cancelled"],
    fields: [
      { key: "customer", label: "Customer", type: "text" },
      { key: "requestedDeliveryDate", label: "Requested delivery date", type: "date" },
      { key: "items", label: "Items", type: "textarea", placeholder: "One item per line" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "confidence", label: "Extraction confidence", type: "number", placeholder: "0.0 - 1.0" },
    ],
    listColumns: ["customer", "requestedDeliveryDate", "quantity"],
    actions: [
      { label: "Submit for approval", from: ["draft"], to: "pending_approval", tone: "primary" },
      { label: "Approve order", from: ["pending_approval"], to: "confirmed", tone: "success" },
      { label: "Reject order", from: ["pending_approval"], to: "cancelled", tone: "danger" },
      { label: "Mark fulfilled", from: ["confirmed"], to: "fulfilled", tone: "success" },
      { label: "Cancel order", from: ["draft", "confirmed"], to: "cancelled", tone: "danger" },
    ],
    lineItemsKey: "items",
    customerReply: {
      label: "Send confirmation to customer",
      availableWhen: ["confirmed", "fulfilled"],
      buildMessage: (record) => {
        const items = record.data.items;
        const itemsText = Array.isArray(items)
          ? items.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ")
          : typeof items === "string"
          ? items.replace(/\n/g, ", ")
          : "";
        const delivery = record.data.requestedDeliveryDate ? ` Expected delivery: ${record.data.requestedDeliveryDate}.` : "";
        return `Good news! Your order "${record.title}" has been confirmed.${itemsText ? ` Items: ${itemsText}.` : ""}${delivery} We will keep you updated. Thank you for your business!`;
      },
    },
  },
  products: {
    title: "Products workspace",
    description: "Handle product inquiries, price requests, and catalog updates from inbound messages.",
    recordTypes: [
      { value: "product", label: "Product" },
      { value: "sku", label: "SKU" },
      { value: "price_list", label: "Price list" },
      { value: "product_document", label: "Product document" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "product", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "price", label: "Price", type: "number" },
      { key: "availability", label: "Availability", type: "select", options: ["in_stock", "out_of_stock", "preorder", "unknown"] },
      { key: "inquiry", label: "Inquiry", type: "textarea" },
    ],
    listColumns: ["product", "sku", "availability"],
    actions: [
      { label: "Answer inquiry", from: ["open", "pending"], to: "completed", tone: "success" },
      { label: "Investigate", from: ["open"], to: "in_progress", tone: "primary" },
      { label: "Resolve", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  "inventory-warehouse": {
    title: "Inventory workspace",
    description: "Monitor stock updates, low-stock signals, warehouse tasks, and order stock impact.",
    recordTypes: [
      { value: "stock_item", label: "Stock item" },
      { value: "warehouse", label: "Warehouse" },
      { value: "movement", label: "Movement" },
      { value: "stock_alert", label: "Stock alert" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "product", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "stockLevel", label: "Stock level", type: "number" },
      { key: "reorderPoint", label: "Reorder point", type: "number" },
      { key: "warehouse", label: "Warehouse", type: "text" },
      { key: "movementType", label: "Movement type", type: "select", options: ["inbound", "outbound", "adjustment"] },
    ],
    listColumns: ["product", "stockLevel", "reorderPoint", "warehouse"],
    actions: [
      { label: "Process movement", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Complete", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
    rowAlert: {
      label: "Low stock",
      applies: (data) => {
        const level = Number(data.stockLevel);
        const threshold = Number(data.reorderPoint);
        return Number.isFinite(level) && Number.isFinite(threshold) && level <= threshold;
      },
    },
  },
  "supplier-management": {
    title: "Supplier workspace",
    description: "Manage supplier quotes, delivery delays, ETA updates, and supplier follow-up tasks.",
    recordTypes: [
      { value: "supplier", label: "Supplier" },
      { value: "quote", label: "Quote" },
      { value: "delivery_update", label: "Delivery update" },
      { value: "follow_up_task", label: "Follow-up task" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "contact", label: "Contact", type: "text" },
      { key: "quoteAmount", label: "Quote amount", type: "number" },
      { key: "eta", label: "ETA", type: "date" },
      { key: "delayReason", label: "Delay reason", type: "textarea" },
    ],
    listColumns: ["supplier", "eta", "quoteAmount"],
    actions: [
      { label: "Follow up", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Resolve", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  "finance-billing": {
    title: "Finance workspace",
    description: "Track invoice questions, payment proofs, billing disputes, and finance approvals from inbound messages.",
    recordTypes: [
      { value: "invoice_case", label: "Invoice case" },
      { value: "payment_proof", label: "Payment proof" },
      { value: "credit_note_request", label: "Credit note request" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "invoiceNumber", label: "Invoice number", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "paymentStatus", label: "Payment status", type: "select", options: ["unpaid", "partial", "paid", "disputed"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    listColumns: ["invoiceNumber", "amount", "dueDate", "paymentStatus"],
    actions: [
      { label: "Start review", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Mark settled", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close case", from: ["completed"], to: "closed", tone: "success" },
    ],
    rowAlert: {
      label: "Overdue",
      applies: (data) => {
        if (data.paymentStatus === "paid") return false;
        const due = typeof data.dueDate === "string" ? Date.parse(data.dueDate) : NaN;
        return Number.isFinite(due) && due < Date.now();
      },
    },
  },
  "sales-crm": {
    title: "Sales workspace",
    description: "Capture leads, pricing inquiries, quote requests, and sales handoffs from customer conversations.",
    recordTypes: [
      { value: "lead", label: "Lead" },
      { value: "deal", label: "Deal" },
      { value: "company", label: "Company" },
      { value: "follow_up_task", label: "Follow-up task" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "company", label: "Company", type: "text" },
      { key: "contact", label: "Contact", type: "text" },
      { key: "stage", label: "Stage", type: "select", options: ["new", "contacted", "qualified", "proposal", "won", "lost"] },
      { key: "interest", label: "Interest", type: "textarea" },
      { key: "budget", label: "Budget", type: "text" },
      { key: "nextStep", label: "Next step", type: "text" },
    ],
    listColumns: ["company", "contact", "stage"],
    actions: [
      { label: "Qualify lead", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Close deal", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Archive", from: ["completed"], to: "closed", tone: "success" },
    ],
    boardField: "stage",
  },
  procurement: {
    title: "Procurement workspace",
    description: "Process purchase requests, supplier quotes, approvals, and purchase orders.",
    recordTypes: [
      { value: "purchase_request", label: "Purchase request" },
      { value: "purchase_order", label: "Purchase order" },
      { value: "quote_comparison", label: "Quote comparison" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "item", label: "Item", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "budget", label: "Budget", type: "text" },
      { key: "requestedBy", label: "Requested by", type: "text" },
      { key: "neededBy", label: "Needed by", type: "date" },
    ],
    listColumns: ["item", "supplier", "neededBy"],
    actions: [
      { label: "Request approval", from: ["open", "draft"], to: "pending", tone: "primary" },
      { label: "Approve purchase", from: ["pending"], to: "in_progress", tone: "success" },
      { label: "Mark ordered", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  "hr-recruitment": {
    title: "HR workspace",
    description: "Manage candidates, interview scheduling, leave requests, and HR approvals from inbound messages.",
    recordTypes: [
      { value: "candidate", label: "Candidate" },
      { value: "hr_task", label: "HR task" },
      { value: "interview_follow_up", label: "Interview follow-up" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "candidate", label: "Candidate", type: "text" },
      { key: "position", label: "Position", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "stage", label: "Stage", type: "select", options: ["applied", "screening", "interview", "offer", "hired", "rejected"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    listColumns: ["candidate", "position", "stage"],
    actions: [
      { label: "Start screening", from: ["open", "pending"], to: "in_progress", tone: "primary" },
      { label: "Complete process", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  "field-service": {
    title: "Field Service workspace",
    description: "Coordinate repair requests, appointments, technician assignments, and job status updates.",
    recordTypes: [
      { value: "service_job", label: "Service job" },
      { value: "technician_task", label: "Technician task" },
      { value: "site_contact", label: "Site contact" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "customer", label: "Customer", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "issue", label: "Issue", type: "textarea" },
      { key: "scheduledDate", label: "Scheduled date", type: "date" },
      { key: "technician", label: "Technician", type: "text" },
    ],
    listColumns: ["customer", "location", "scheduledDate"],
    actions: [
      { label: "Schedule job", from: ["open", "draft"], to: "pending", tone: "primary" },
      { label: "Dispatch technician", from: ["pending"], to: "in_progress", tone: "primary" },
      { label: "Complete job", from: ["in_progress"], to: "completed", tone: "success" },
      { label: "Close", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
  "office-productivity": {
    title: "Productivity workspace",
    description: "Track tasks, reminders, document requests, and meeting notes created from inbound messages.",
    recordTypes: [
      { value: "task", label: "Task" },
      { value: "reminder", label: "Reminder" },
      { value: "document_request", label: "Document request" },
      { value: "meeting_note", label: "Meeting note" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "task", label: "Task", type: "text" },
      { key: "assignee", label: "Assignee", type: "text" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    listColumns: ["task", "assignee", "dueDate"],
    actions: DEFAULT_ACTIONS,
  },
  "reporter-agent": {
    title: "Reporter Agent workspace",
    description: "Review cross-module alerts, recommendations, resolved signals, and management summaries.",
    recordTypes: [
      { value: "report", label: "Report" },
      { value: "alert", label: "Alert" },
      { value: "recommendation", label: "Recommendation" },
      { value: "resolved_signal", label: "Resolved signal" },
    ],
    statuses: DEFAULT_STATUSES,
    fields: [
      { key: "outputType", label: "Output type", type: "select", options: ["immediate_alert", "daily_digest", "weekly_summary", "module_report"] },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "recommendedActions", label: "Recommended actions", type: "textarea" },
      { key: "openSignalCount", label: "Open signal count", type: "number" },
    ],
    listColumns: ["outputType", "openSignalCount"],
    actions: [
      { label: "Acknowledge", from: ["open", "pending"], to: "completed", tone: "primary" },
      { label: "Archive", from: ["completed"], to: "closed", tone: "success" },
    ],
  },
};

const FALLBACK_WORKSPACE: ModuleWorkspaceConfig = {
  title: "Module workspace",
  description: "Operate records and Reporter Agent signals for this module.",
  recordTypes: [{ value: "record", label: "Record" }],
  statuses: DEFAULT_STATUSES,
  fields: [],
  listColumns: [],
  actions: DEFAULT_ACTIONS,
};

export function getWorkspaceConfig(slug: string): ModuleWorkspaceConfig {
  return MODULE_WORKSPACES[slug] || FALLBACK_WORKSPACE;
}
