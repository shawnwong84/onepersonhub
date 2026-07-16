import { createEcomConnector } from "ecom-connector";
import type { TestConnectionResult } from "@/lib/connectors/test-connection";

/**
 * All `ecom-connector` SDK usage is isolated to this one file. The generic
 * OAuth authorize/callback/refresh routes and test-connection.ts each
 * branch to a function here when a provider's catalog entry sets
 * `ecomSdkPlatform` (see catalog.ts) - Shopee/TikTok Shop sign every
 * request (HMAC) rather than using a vanilla OAuth2 client_secret POST, so
 * the app's own generic template-based fetch can't produce a valid
 * request; the SDK already encapsulates each platform's real signing/auth
 * mechanics.
 *
 * Verified against the installed package's own .d.ts files (not assumed
 * from the README) - see node_modules/ecom-connector/dist/platforms/*\/index.d.ts:
 *   - Shopee:      generateAuthUrl(redirectUrl) / getAccessToken(code, shopId?, mainAccountId?)
 *                  / refreshAccessToken(refreshToken, shopId?, mainAccountId?)
 *                  - returns a precisely-typed { accessToken, refreshToken, expireIn, shopId?, ... }.
 *   - Lazada:      generateAuthUrl(redirectUrl, uuid) / getAccessToken(authCode, uuid)
 *                  / refreshAccessToken(refreshToken) - untyped `any` return,
 *                  so both camelCase and snake_case keys are read defensively below.
 *   - TikTok Shop: NO generateAuthUrl method on the class at all - the
 *                  authorize URL is built by hand from TIKTOK_CONSTANTS.ENDPOINT_AUTH_V2.
 *                  getAccessToken(authCode) / refreshAccessToken(refreshToken) - also `any`.
 */

export type EcomSdkPlatform = "shopee" | "lazada" | "tiktok-shop";

const TIKTOK_AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

export interface EcomTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  shopId?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Shopee/Lazada/TikTok Shop partner-app credentials are this deployment's
 * own, shared across every company - one partner app per platform, set via
 * env vars rather than entered per-connector (see .env.example). Only the
 * per-shop accessToken/refreshToken/shopId are tenant-specific and stored
 * on the Connector row. */
function getEcomAppCredentials(platform: EcomSdkPlatform): Record<string, string> {
  if (platform === "shopee") {
    return {
      partnerId: process.env.SHOPEE_PARTNER_ID ?? "",
      partnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
    };
  }
  if (platform === "lazada") {
    return {
      appKey: process.env.LAZADA_APP_KEY ?? "",
      appSecret: process.env.LAZADA_APP_SECRET ?? "",
    };
  }
  return {
    appKey: process.env.TIKTOK_SHOP_APP_KEY ?? "",
    appSecret: process.env.TIKTOK_SHOP_APP_SECRET ?? "",
  };
}

/** Builds the exact credentials shape each platform's SDK class expects:
 * app-level credentials from env (see getEcomAppCredentials) plus the
 * per-shop shopId/accessToken carried in this connector's own stored
 * config/credentials JSON blobs. */
function buildSdkConnector(
  platform: EcomSdkPlatform,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>
) {
  const appCredentials = getEcomAppCredentials(platform);
  const accessToken = asString(credentials.accessToken);
  if (platform === "shopee") {
    return createEcomConnector({
      platform: "shopee",
      credentials: {
        partnerId: appCredentials.partnerId,
        partnerKey: appCredentials.partnerKey,
        shopId: asString(config.shopId) ?? "",
        accessToken,
      },
    });
  }
  if (platform === "lazada") {
    return createEcomConnector({
      platform: "lazada",
      credentials: {
        appKey: appCredentials.appKey,
        appSecret: appCredentials.appSecret,
        accessToken,
      },
    });
  }
  return createEcomConnector({
    platform: "tiktok-shop",
    credentials: {
      appKey: appCredentials.appKey,
      appSecret: appCredentials.appSecret,
      shopId: asString(config.shopId) ?? "",
      accessToken,
    },
  });
}

/** `state` doubles as our CSRF state token and (for Lazada) the SDK's
 * required `uuid` param. Shopee's generateAuthUrl has no state/uuid
 * parameter at all, so it's appended to redirectUri's own query string
 * instead - Shopee's redirect preserves and echoes back unknown query
 * params on the callback, which is where it's read back out. */
export function buildEcomAuthorizeUrl(
  platform: EcomSdkPlatform,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>,
  redirectUri: string,
  state: string
): string {
  if (platform === "tiktok-shop") {
    const url = new URL(TIKTOK_AUTHORIZE_URL);
    url.searchParams.set("app_key", getEcomAppCredentials("tiktok-shop").appKey);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  }

  const connector = buildSdkConnector(platform, config, credentials);
  if (platform === "lazada") {
    return connector.generateAuthUrl!(redirectUri, state);
  }
  // shopee
  const shopeeRedirect = new URL(redirectUri);
  shopeeRedirect.searchParams.set("state", state);
  return connector.generateAuthUrl!(shopeeRedirect.toString());
}

/** `extra.shopId` is Shopee's own `shop_id` query param, present on its
 * callback redirect (captured by the callback route before calling this). */
export async function exchangeEcomCode(
  platform: EcomSdkPlatform,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>,
  code: string,
  extra: { shopId?: string; state?: string }
): Promise<EcomTokenResult> {
  const connector = buildSdkConnector(platform, config, credentials);

  if (platform === "shopee") {
    const result = await connector.getAccessToken!(code, extra.shopId);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expireIn,
      shopId: result.shopId ? String(result.shopId) : extra.shopId,
    };
  }
  if (platform === "lazada") {
    const result = await connector.getAccessToken!(code, extra.state ?? "");
    return {
      accessToken: result.accessToken ?? result.access_token,
      refreshToken: result.refreshToken ?? result.refresh_token,
      expiresIn: result.expiresIn ?? result.expires_in,
    };
  }
  // tiktok-shop
  const result = await connector.getAccessToken!(code);
  return {
    accessToken: result.accessToken ?? result.access_token,
    refreshToken: result.refreshToken ?? result.refresh_token,
    expiresIn: result.expiresIn ?? result.expires_in,
  };
}

export async function refreshEcomToken(
  platform: EcomSdkPlatform,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>
): Promise<EcomTokenResult> {
  const connector = buildSdkConnector(platform, config, credentials);
  const refreshToken = asString(credentials.refreshToken) ?? "";

  if (platform === "shopee") {
    const shopId = asString(config.shopId);
    const result = await connector.refreshAccessToken!(refreshToken, shopId);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expireIn };
  }
  // lazada and tiktok-shop both take just (refreshToken)
  const result = await connector.refreshAccessToken!(refreshToken);
  return {
    accessToken: result.accessToken ?? result.access_token,
    refreshToken: result.refreshToken ?? result.refresh_token,
    expiresIn: result.expiresIn ?? result.expires_in,
  };
}

export async function testEcomConnection(
  platform: EcomSdkPlatform,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>
): Promise<TestConnectionResult> {
  const testedAt = new Date().toISOString();
  try {
    const connector = buildSdkConnector(platform, config, credentials);
    const products = await connector.getProducts({ limit: 1 });
    return { ok: true, message: `Connected - ${products.length} product(s) visible`, testedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: message.slice(0, 500), testedAt };
  }
}
