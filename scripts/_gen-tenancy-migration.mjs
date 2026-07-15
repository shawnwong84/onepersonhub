import fs from "fs";

const COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Standard models: get a plain companyId column + index + FK, no other schema change.
const STANDARD_MODELS = [
  "Admin", "Category", "KnowledgeEntry", "KnowledgeDocument", "KnowledgeIngestionRun",
  "KnowledgeChunk", "WebsiteSource", "TokenUsage", "Department", "RolePermission",
  "TeamMember", "ReporterChatThread", "ReporterChatMessage", "ModuleAssignment",
  "Conversation", "Message", "Ticket", "ConversationTag", "CallLog", "Agent",
  "ChannelAccount", "AgentChannelAccount", "AgentKnowledgeScope", "AgentWorkflow",
  "AgentTool", "Schedule", "Webhook", "WebhookDelivery", "ActivityLog", "Notification",
  "SLARule", "CannedResponse", "Customer", "CustomerNote", "AutomationRule", "ApiKey",
  "InternalNote", "Campaign", "Flow", "WorkflowRun", "WorkflowRunStep", "WorkflowJob",
  "ModuleRecord", "ModuleRecordEvent", "ModuleSignal", "ConnectorOAuthState",
];

// Models needing a unique-constraint swap from a global unique to a per-company one.
const UNIQUE_SWAPS = [
  { model: "Role", oldIndex: "Role_name_key", cols: ["companyId", "name"] },
  { model: "Channel", oldIndex: "Channel_type_key", cols: ["companyId", "type"] },
  { model: "Tag", oldIndex: "Tag_name_key", cols: ["companyId", "name"] },
  { model: "BusinessModule", oldIndex: "BusinessModule_slug_key", cols: ["companyId", "slug"] },
  { model: "Connector", oldIndex: "Connector_provider_name_key", cols: ["companyId", "provider", "name"] },
];

// Singleton models: id "default" -> companyId as the PK.
const SINGLETONS = ["Settings", "BusinessHours", "BillingAccount"];

let sql = `-- Multi-tenant migration: introduces "Company" as the tenant root and
-- scopes every other model to it via a plain "companyId" column (no Prisma-
-- level relation object - enforced by the FK constraints below and by the
-- tenant-scoping Prisma Client Extension at the application level).
--
-- Existing data becomes "Company #1" (fixed id below) so nothing is orphaned.

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Company" ("id", "name", "updatedAt")
SELECT '${COMPANY_ID}', COALESCE((SELECT "businessName" FROM "Settings" WHERE id = 'default'), 'Default Company'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Company" WHERE id = '${COMPANY_ID}');

`;

for (const model of STANDARD_MODELS) {
  sql += `-- ${model}
ALTER TABLE "${model}" ADD COLUMN "companyId" TEXT;
UPDATE "${model}" SET "companyId" = '${COMPANY_ID}' WHERE "companyId" IS NULL;
ALTER TABLE "${model}" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "${model}_companyId_idx" ON "${model}"("companyId");
ALTER TABLE "${model}" ADD CONSTRAINT "${model}_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

`;
}

for (const { model, oldIndex, cols } of UNIQUE_SWAPS) {
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const newIndexName = `${model}_${cols.join("_")}_key`;
  sql += `-- ${model} (unique constraint swap to per-company)
ALTER TABLE "${model}" ADD COLUMN "companyId" TEXT;
UPDATE "${model}" SET "companyId" = '${COMPANY_ID}' WHERE "companyId" IS NULL;
ALTER TABLE "${model}" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "${model}_companyId_idx" ON "${model}"("companyId");
ALTER TABLE "${model}" ADD CONSTRAINT "${model}_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "${oldIndex}";
CREATE UNIQUE INDEX "${newIndexName}" ON "${model}"(${colList});

`;
}

for (const model of SINGLETONS) {
  sql += `-- ${model} (singleton "default" row -> per-company row, PK becomes companyId)
ALTER TABLE "${model}" ADD COLUMN "companyId" TEXT;
UPDATE "${model}" SET "companyId" = '${COMPANY_ID}' WHERE id = 'default';
-- Any deployment somehow without a "default" row yet gets one created fresh.
INSERT INTO "${model}" ("companyId")
SELECT '${COMPANY_ID}'
WHERE NOT EXISTS (SELECT 1 FROM "${model}" WHERE "companyId" = '${COMPANY_ID}');
ALTER TABLE "${model}" DROP CONSTRAINT "${model}_pkey";
ALTER TABLE "${model}" DROP COLUMN "id";
ALTER TABLE "${model}" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "${model}" ADD CONSTRAINT "${model}_pkey" PRIMARY KEY ("companyId");
ALTER TABLE "${model}" ADD CONSTRAINT "${model}_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

`;
}

const outPath = "prisma/migrations/20260714000000_add_multi_tenancy/migration.sql";
fs.writeFileSync(outPath, sql);
console.log("Wrote", outPath, "-", sql.split("\n").length, "lines");
console.log("Models covered:", STANDARD_MODELS.length + UNIQUE_SWAPS.length + SINGLETONS.length, "(+ Company itself)");
