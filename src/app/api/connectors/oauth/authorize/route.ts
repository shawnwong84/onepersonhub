import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { fillUrlTemplate, getConnectorProvider } from "@/lib/connectors/catalog";
import { buildEcomAuthorizeUrl } from "@/lib/connectors/ecom-sdk";

const STATE_TTL_MS = 10 * 60 * 1000;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Starts an OAuth2 authorization-code flow for a connector. Takes provider
 * config (including the client secret) in the POST body - never a query
 * string, so a secret never ends up in a URL or browser history. Returns a
 * redirectUrl the client navigates to; this route itself never redirects.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = asString(body.provider);
    const connectorId = asString(body.connectorId) || null;

    const auth = await requireAuth(request, connectorId ? "connectors:update" : "connectors:create");
    if (!isAuthenticated(auth)) return auth;

    const catalogEntry = getConnectorProvider(provider);
    if (!catalogEntry || catalogEntry.authType !== "oauth2" || (!catalogEntry.oauth && !catalogEntry.ecomSdkPlatform)) {
      return NextResponse.json({ error: "Unknown or non-OAuth2 provider" }, { status: 400 });
    }

    // The single credentials-location field is "the secret" staged in
    // pendingClientSecret until the callback completes - named clientSecret
    // for standard OAuth2 providers, partnerKey/appSecret for e-commerce
    // ones (see ecomSdkPlatform providers in catalog.ts).
    const credentialsFieldKey = catalogEntry.fields.find((f) => f.location === "credentials")?.key ?? "clientSecret";

    const pendingConfig: Record<string, string> = {};
    let clientSecret = "";
    for (const field of catalogEntry.fields) {
      const value = asString(body[field.key]);
      if (field.key === credentialsFieldKey) {
        clientSecret = value;
      } else if (field.location === "config" && value) {
        pendingConfig[field.key] = value;
      }
    }

    // ecomSdkPlatform providers have no credentials-location field at all -
    // their secret is the deployment's own env-sourced partner app
    // credential (see ecom-sdk.ts), not something staged per-connector.
    const requiresClientSecret = !catalogEntry.ecomSdkPlatform;

    const missing = catalogEntry.fields.filter(
      (f) => f.required && f.key !== credentialsFieldKey && !pendingConfig[f.key]
    );
    const name = asString(body.name);
    if (missing.length > 0 || (requiresClientSecret && !clientSecret) || (!connectorId && !name)) {
      return NextResponse.json(
        {
          error: `Missing required fields: ${[
            ...missing.map((f) => f.key),
            requiresClientSecret && !clientSecret ? credentialsFieldKey : null,
            !connectorId && !name ? "name" : null,
          ]
            .filter(Boolean)
            .join(", ")}`,
        },
        { status: 400 }
      );
    }

    const state = base64url(crypto.randomBytes(32));
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (catalogEntry.oauth?.pkce) {
      codeVerifier = base64url(crypto.randomBytes(32));
      codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
    }

    await prisma.connectorOAuthState.create({
      data: {
        companyId: auth.companyId,
        state,
        provider,
        connectorId,
        pendingName: name || null,
        pendingConfig,
        pendingClientSecret: clientSecret || null,
        codeVerifier,
        createdBy: auth.userId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/connectors/oauth/callback`;

    if (catalogEntry.ecomSdkPlatform) {
      const redirectUrl = buildEcomAuthorizeUrl(
        catalogEntry.ecomSdkPlatform,
        pendingConfig,
        { [credentialsFieldKey]: clientSecret },
        redirectUri,
        state
      );
      return NextResponse.json({ redirectUrl });
    }

    const authorizeUrl = new URL(fillUrlTemplate(catalogEntry.oauth!.authorizeUrlTemplate, pendingConfig));
    authorizeUrl.searchParams.set("client_id", pendingConfig.clientId ?? "");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", catalogEntry.oauth!.scopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    if (codeChallenge) {
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
    }

    return NextResponse.json({ redirectUrl: authorizeUrl.toString() });
  } catch (error) {
    logger.error("Failed to start connector OAuth flow:", error);
    return NextResponse.json({ error: "Failed to start OAuth flow" }, { status: 500 });
  }
}
