import { prisma } from "@/lib/prisma";
import { fillUrlTemplate, getConnectorProvider } from "@/lib/connectors/catalog";
import { refreshEcomToken } from "@/lib/connectors/ecom-sdk";
import type { Connector } from "@/generated/prisma/client";

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

interface Credentials {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  clientSecret?: string;
  scope?: string;
}

/**
 * Returns a valid access token for an OAuth2 connector, refreshing it first
 * if it's within REFRESH_MARGIN_MS of expiry. On a failed refresh (revoked
 * or expired refresh token), marks the connector status "error" and throws
 * - callers surface this as "reconnect required" rather than crashing.
 */
export async function getValidAccessToken(connector: Connector): Promise<string> {
  const catalogEntry = getConnectorProvider(connector.provider);
  if (!catalogEntry?.oauth && !catalogEntry?.ecomSdkPlatform) {
    throw new Error(`Provider ${connector.provider} is not an OAuth2 provider`);
  }

  const credentials = (connector.credentials ?? {}) as Credentials;
  const config = (connector.config ?? {}) as Record<string, unknown>;

  const expiresAt = credentials.tokenExpiresAt ? new Date(credentials.tokenExpiresAt).getTime() : 0;
  const needsRefresh = !credentials.accessToken || expiresAt - Date.now() < REFRESH_MARGIN_MS;

  if (!needsRefresh && credentials.accessToken) {
    return credentials.accessToken;
  }

  if (!credentials.refreshToken) {
    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "error", lastError: "No refresh token available; reconnect required." },
    });
    throw new Error("No refresh token available; reconnect required.");
  }

  // e-commerce providers (Shopee/Lazada/TikTok Shop) sign every request via
  // the ecom-connector SDK rather than a vanilla client_secret POST - they
  // also don't have a "clientSecret" field, so this branch skips that
  // requirement entirely and returns before it's checked below.
  if (catalogEntry.ecomSdkPlatform) {
    try {
      const result = await refreshEcomToken(catalogEntry.ecomSdkPlatform, config, credentials as unknown as Record<string, unknown>);
      const tokenExpiresAt = new Date(Date.now() + (result.expiresIn ?? 3600) * 1000).toISOString();
      await prisma.connector.update({
        where: { id: connector.id },
        data: {
          status: "connected",
          lastError: null,
          credentials: {
            ...credentials,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken ?? credentials.refreshToken,
            tokenExpiresAt,
          },
        },
      });
      return result.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token refresh failed";
      await prisma.connector.update({
        where: { id: connector.id },
        data: { status: "error", lastError: message.slice(0, 500) },
      });
      throw error;
    }
  }

  if (!credentials.clientSecret) {
    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "error", lastError: "No refresh token available; reconnect required." },
    });
    throw new Error("No refresh token available; reconnect required.");
  }

  const tokenUrl = fillUrlTemplate(catalogEntry.oauth!.tokenUrlTemplate, config);
  const clientId = typeof config.clientId === "string" ? config.clientId : "";

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
        client_id: clientId,
        client_secret: credentials.clientSecret,
        scope: catalogEntry.oauth!.scopes.join(" "),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token refresh request failed";
    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "error", lastError: message.slice(0, 500) },
    });
    throw error;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = `Token refresh failed (${response.status}): ${body.slice(0, 300)}`;
    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "error", lastError: message.slice(0, 500) },
    });
    throw new Error(message);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "error", lastError: "Token refresh response had no access_token." },
    });
    throw new Error("Token refresh response had no access_token.");
  }

  const tokenExpiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();

  await prisma.connector.update({
    where: { id: connector.id },
    data: {
      status: "connected",
      lastError: null,
      credentials: {
        ...credentials,
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? credentials.refreshToken,
        tokenExpiresAt,
      },
    },
  });

  return json.access_token;
}
