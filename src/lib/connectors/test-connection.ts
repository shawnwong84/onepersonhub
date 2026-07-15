import { fillUrlTemplate, getConnectorProvider } from "@/lib/connectors/catalog";
import { getValidAccessToken } from "@/lib/connectors/oauth-refresh";
import type { Connector } from "@/generated/prisma/client";

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  httpStatus?: number;
  testedAt: string;
}

const TIMEOUT_MS = 8000;
const MAX_MESSAGE_LENGTH = 500;

function truncate(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) + "…" : message;
}

async function testSap(connector: Connector): Promise<TestConnectionResult> {
  const config = (connector.config ?? {}) as Record<string, unknown>;
  const credentials = (connector.credentials ?? {}) as Record<string, string>;
  const instanceUrl = typeof config.instanceUrl === "string" ? config.instanceUrl.replace(/\/$/, "") : "";
  if (!instanceUrl) return { ok: false, message: "Missing instanceUrl", testedAt: new Date().toISOString() };

  const headers: Record<string, string> = {};
  if (credentials.apiKey) {
    headers["APIKey"] = credentials.apiKey;
  } else if (credentials.username && credentials.password) {
    headers["Authorization"] = "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  } else {
    return { ok: false, message: "No credentials configured (need apiKey, or username+password)", testedAt: new Date().toISOString() };
  }

  const url = `${instanceUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata`;
  return runFetchCheck(url, { headers });
}

async function testOracle(connector: Connector): Promise<TestConnectionResult> {
  const config = (connector.config ?? {}) as Record<string, unknown>;
  const instanceUrl = typeof config.instanceUrl === "string" ? config.instanceUrl.replace(/\/$/, "") : "";
  if (!instanceUrl) return { ok: false, message: "Missing instanceUrl", testedAt: new Date().toISOString() };

  const accessToken = await getValidAccessToken(connector);
  const url = `${instanceUrl}/fscmRestApi/resources`;
  return runFetchCheck(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function testMicrosoft365(connector: Connector): Promise<TestConnectionResult> {
  const accessToken = await getValidAccessToken(connector);
  return runFetchCheck("https://graph.microsoft.com/v1.0/organization", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function testDynamicsBc(connector: Connector): Promise<TestConnectionResult> {
  const config = (connector.config ?? {}) as Record<string, unknown>;
  const catalogEntry = getConnectorProvider("dynamics_bc");
  if (!catalogEntry) return { ok: false, message: "Unknown provider", testedAt: new Date().toISOString() };

  const accessToken = await getValidAccessToken(connector);
  const url = fillUrlTemplate(
    "https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{environment}/api/v2.0/companies",
    config
  );
  return runFetchCheck(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function testOdoo(connector: Connector): Promise<TestConnectionResult> {
  const config = (connector.config ?? {}) as Record<string, unknown>;
  const credentials = (connector.credentials ?? {}) as Record<string, string>;
  const instanceUrl = typeof config.instanceUrl === "string" ? config.instanceUrl.replace(/\/$/, "") : "";
  const database = typeof config.database === "string" ? config.database : "";
  if (!instanceUrl || !database) {
    return { ok: false, message: "Missing instanceUrl or database", testedAt: new Date().toISOString() };
  }
  if (!credentials.apiKey) {
    return { ok: false, message: "Missing apiKey", testedAt: new Date().toISOString() };
  }

  const testedAt = new Date().toISOString();
  try {
    const response = await fetch(`${instanceUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [database, "__api__", credentials.apiKey, {}],
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, message: truncate(`HTTP ${response.status}`), httpStatus: response.status, testedAt };
    }

    const json = (await response.json()) as { result?: number | false; error?: { message?: string } };
    if (json.error) {
      return { ok: false, message: truncate(json.error.message ?? "Odoo returned an error"), testedAt };
    }
    if (!json.result) {
      return { ok: false, message: "Authentication failed (invalid database or API key)", testedAt };
    }
    return { ok: true, message: `Authenticated as uid ${json.result}`, testedAt };
  } catch (error) {
    return { ok: false, message: truncate(describeError(error)), testedAt };
  }
}

async function runFetchCheck(url: string, init: RequestInit): Promise<TestConnectionResult> {
  const testedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) {
      return { ok: true, message: `HTTP ${response.status}`, httpStatus: response.status, testedAt };
    }
    const body = await response.text().catch(() => "");
    return { ok: false, message: truncate(`HTTP ${response.status}: ${body}`), httpStatus: response.status, testedAt };
  } catch (error) {
    return { ok: false, message: truncate(describeError(error)), testedAt };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "Request timed out";
    return error.message;
  }
  return "Unknown error";
}

export async function testConnection(connector: Connector): Promise<TestConnectionResult> {
  switch (connector.provider) {
    case "sap":
      return testSap(connector);
    case "oracle":
      return testOracle(connector);
    case "microsoft365":
      return testMicrosoft365(connector);
    case "dynamics_bc":
      return testDynamicsBc(connector);
    case "odoo":
      return testOdoo(connector);
    default:
      return { ok: false, message: `Unknown provider: ${connector.provider}`, testedAt: new Date().toISOString() };
  }
}
