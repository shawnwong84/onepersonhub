/**
 * Connector provider catalog (ERP + e-commerce). Each entry describes the
 * fields a connect form needs, and (for OAuth2 providers) how to build the
 * authorize/token URLs. This is intentionally a static, hand-maintained
 * table - not driven by an external registry - because every provider here
 * needs a customer-specific tenant/instance and their own OAuth app
 * registration; there is no generic multi-tenant client this app can ship
 * with. E-commerce providers (Shopee, Lazada, TikTok Shop) route through
 * the `ecom-connector` SDK instead of the generic template fetch below -
 * see `ecomSdkPlatform` on ConnectorProviderDef.
 */

export type ConnectorProvider = "sap" | "oracle" | "microsoft365" | "dynamics_bc" | "odoo" | "shopee" | "lazada" | "tiktok-shop";
export type ConnectorAuthType = "oauth2" | "api_key" | "basic_auth";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  location: "config" | "credentials";
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  /** Only relevant for SAP, which supports two credential shapes. */
  authMode?: "api_key" | "basic";
}

export interface OAuthProviderDef {
  /** May reference {tenantId} / {idcsHost} - substituted from the connector's config. */
  authorizeUrlTemplate: string;
  tokenUrlTemplate: string;
  scopes: string[];
  pkce: boolean;
}

export interface TestConnectionDef {
  description: string;
  /** Unverified against a real tenant - see catalog entry comments below. */
  liveVerified: boolean;
}

export interface ConnectorProviderDef {
  provider: ConnectorProvider;
  name: string;
  description: string;
  authType: ConnectorAuthType;
  fields: ConnectorFieldDef[];
  oauth?: OAuthProviderDef;
  testConnection: TestConnectionDef;
  /** When set, OAuth authorize/token-exchange/refresh delegates to the
   * `ecom-connector` npm SDK (src/lib/connectors/ecom-sdk.ts) instead of the
   * generic template-based fetch above - Shopee/TikTok Shop sign every
   * request (HMAC) rather than using a vanilla OAuth2 client_secret POST,
   * which the generic flow can't produce. No `oauth` block is set for these
   * providers since that shape doesn't apply. */
  ecomSdkPlatform?: "shopee" | "lazada" | "tiktok-shop";
}

export const CONNECTOR_PROVIDERS: ConnectorProviderDef[] = [
  {
    provider: "sap",
    name: "SAP S/4HANA",
    description: "Connect via an OData service using an API key or basic auth.",
    authType: "api_key",
    fields: [
      { key: "instanceUrl", label: "Instance URL", location: "config", type: "url", required: true, placeholder: "https://your-sap-host.com" },
      { key: "apiKey", label: "API Key", location: "credentials", type: "password", required: false, authMode: "api_key" },
      { key: "username", label: "Username", location: "credentials", type: "text", required: false, authMode: "basic" },
      { key: "password", label: "Password", location: "credentials", type: "password", required: false, authMode: "basic" },
    ],
    testConnection: {
      // API_BUSINESS_PARTNER is a commonly-enabled standard SAP OData
      // service, used here as a cheap side-effect-free auth check - but
      // which OData services are activated varies per real S/4HANA
      // instance (/IWFND/MAINT_SERVICE). Confirm against the target tenant.
      description: "GET {instanceUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
      liveVerified: false,
    },
  },
  {
    provider: "oracle",
    name: "Oracle Fusion / ERP Cloud",
    description: "OAuth2 via Oracle Identity Cloud Service (IDCS).",
    authType: "oauth2",
    fields: [
      { key: "instanceUrl", label: "Fusion Instance URL", location: "config", type: "url", required: true, placeholder: "https://xxxx.fa.ocs.oraclecloud.com" },
      { key: "idcsHost", label: "IDCS Host", location: "config", type: "text", required: true, placeholder: "idcs-xxxx.identity.oraclecloud.com" },
      { key: "clientId", label: "Client ID", location: "config", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", location: "credentials", type: "password", required: true },
    ],
    oauth: {
      authorizeUrlTemplate: "https://{idcsHost}/oauth2/v1/authorize",
      tokenUrlTemplate: "https://{idcsHost}/oauth2/v1/token",
      // Oracle's resource-scoped format is tenant-issued; this is the
      // documented shape but must be confirmed against the real IDCS
      // client's registered scopes.
      scopes: ["urn:opc:resource:consumer::all"],
      pkce: true,
    },
    testConnection: {
      description: "GET {instanceUrl}/fscmRestApi/resources",
      liveVerified: false,
    },
  },
  {
    provider: "microsoft365",
    name: "Microsoft 365",
    description: "OAuth2 via the Microsoft identity platform (Azure AD).",
    authType: "oauth2",
    fields: [
      { key: "tenantId", label: "Tenant ID", location: "config", type: "text", required: true },
      { key: "clientId", label: "Client ID", location: "config", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", location: "credentials", type: "password", required: true },
    ],
    oauth: {
      authorizeUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scopes: ["https://graph.microsoft.com/.default", "offline_access"],
      pkce: true,
    },
    testConnection: {
      description: "GET https://graph.microsoft.com/v1.0/organization",
      liveVerified: false,
    },
  },
  {
    provider: "dynamics_bc",
    name: "Dynamics 365 Business Central",
    description: "OAuth2 via the Microsoft identity platform (same tenant as Microsoft 365, different API scope).",
    authType: "oauth2",
    fields: [
      { key: "tenantId", label: "Tenant ID", location: "config", type: "text", required: true },
      { key: "clientId", label: "Client ID", location: "config", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", location: "credentials", type: "password", required: true },
      { key: "environment", label: "Environment", location: "config", type: "text", required: true, placeholder: "Production" },
    ],
    oauth: {
      authorizeUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrlTemplate: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      scopes: ["https://api.businesscentral.dynamics.com/.default", "offline_access"],
      pkce: true,
    },
    testConnection: {
      // Path segment ordering varies between BC SaaS and on-prem / API
      // version - confirm against the real tenant.
      description: "GET https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{environment}/api/v2.0/companies",
      liveVerified: false,
    },
  },
  {
    provider: "odoo",
    name: "Odoo",
    description: "Connect via Odoo's JSON-RPC external API using an API key.",
    authType: "api_key",
    fields: [
      { key: "instanceUrl", label: "Instance URL", location: "config", type: "url", required: true, placeholder: "https://your-odoo-host.com" },
      { key: "database", label: "Database Name", location: "config", type: "text", required: true },
      { key: "apiKey", label: "API Key", location: "credentials", type: "password", required: true },
    ],
    testConnection: {
      // authenticate() argument shape can vary slightly across Odoo
      // versions (13 vs 17) - structurally correct per documented API,
      // unverified live.
      description: "POST {instanceUrl}/jsonrpc — common.authenticate(database, '__api__', apiKey, {})",
      liveVerified: false,
    },
  },
  {
    provider: "shopee",
    name: "Shopee",
    description: "Connect a Shopee shop via the Shopee Open Platform (partner app).",
    authType: "oauth2",
    fields: [
      { key: "partnerId", label: "Partner ID", location: "config", type: "text", required: true },
      { key: "shopId", label: "Shop ID", location: "config", type: "text", required: true },
      { key: "partnerKey", label: "Partner Key", location: "credentials", type: "password", required: true },
    ],
    ecomSdkPlatform: "shopee",
    testConnection: {
      description: "SDK call: getProducts({ limit: 1 }) using the stored access token.",
      liveVerified: false,
    },
  },
  {
    provider: "lazada",
    name: "Lazada",
    description: "Connect a Lazada seller account via the Lazada Open Platform.",
    authType: "oauth2",
    fields: [
      { key: "appKey", label: "App Key", location: "config", type: "text", required: true },
      { key: "appSecret", label: "App Secret", location: "credentials", type: "password", required: true },
    ],
    ecomSdkPlatform: "lazada",
    testConnection: {
      description: "SDK call: getProducts({ limit: 1 }) using the stored access token.",
      liveVerified: false,
    },
  },
  {
    provider: "tiktok-shop",
    name: "TikTok Shop",
    description: "Connect a TikTok Shop via the TikTok Shop Partner Center.",
    authType: "oauth2",
    fields: [
      { key: "appKey", label: "App Key", location: "config", type: "text", required: true },
      { key: "shopId", label: "Shop ID", location: "config", type: "text", required: true },
      { key: "appSecret", label: "App Secret", location: "credentials", type: "password", required: true },
    ],
    ecomSdkPlatform: "tiktok-shop",
    testConnection: {
      description: "SDK call: getProducts({ limit: 1 }) using the stored access token.",
      liveVerified: false,
    },
  },
];

export function getConnectorProvider(provider: string): ConnectorProviderDef | undefined {
  return CONNECTOR_PROVIDERS.find((entry) => entry.provider === provider);
}

/** Substitutes {tenantId} / {idcsHost} / {environment} placeholders from a connector's config. */
export function fillUrlTemplate(template: string, config: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = config[key];
    return typeof value === "string" && value ? value : match;
  });
}
