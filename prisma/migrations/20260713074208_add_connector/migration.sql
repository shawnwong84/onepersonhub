-- Structural framework for ERP connectors (SAP, Oracle Fusion, Microsoft
-- 365, Dynamics 365 Business Central, Odoo). Credential storage + manual
-- test-connection ping only in this pass - no live data sync.

CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Connector_provider_name_key" ON "Connector"("provider", "name");
CREATE INDEX "Connector_provider_idx" ON "Connector"("provider");
CREATE INDEX "Connector_status_idx" ON "Connector"("status");

CREATE TABLE "ConnectorOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connectorId" TEXT,
    "pendingName" TEXT,
    "pendingConfig" JSONB NOT NULL DEFAULT '{}',
    "pendingClientSecret" TEXT,
    "codeVerifier" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorOAuthState_state_key" ON "ConnectorOAuthState"("state");
CREATE INDEX "ConnectorOAuthState_expiresAt_idx" ON "ConnectorOAuthState"("expiresAt");
