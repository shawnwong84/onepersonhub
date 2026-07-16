import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { fillUrlTemplate, getConnectorProvider } from "@/lib/connectors/catalog";
import { exchangeEcomCode } from "@/lib/connectors/ecom-sdk";

/**
 * Completes an OAuth2 authorization-code flow. This route is reached via a
 * top-level browser redirect from the IdP (same-origin redirect_uri, so the
 * session cookie is sent under SameSite=Lax) - not called via fetch, so it
 * always responds with a 302 back to /connectors rather than JSON.
 */
export async function GET(request: NextRequest) {
  const redirectBase = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/connectors`;

  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=unauthenticated`);
  }

  const { searchParams } = new URL(request.url);
  const idpError = searchParams.get("error");
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  // Shopee's redirect includes its own shop_id query param alongside code/state.
  const shopIdParam = searchParams.get("shop_id") ?? undefined;

  if (idpError) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=${encodeURIComponent(idpError)}`);
  }
  if (!state || !code) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=missing_code_or_state`);
  }

  const stateRecord = await prisma.connectorOAuthState.findUnique({ where: { state } });
  if (!stateRecord) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=invalid_state`);
  }

  // Single use: delete immediately regardless of what happens next.
  await prisma.connectorOAuthState.delete({ where: { id: stateRecord.id } }).catch(() => {});

  if (stateRecord.expiresAt.getTime() < Date.now()) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=state_expired`);
  }
  if (stateRecord.createdBy !== auth.userId) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=state_mismatch`);
  }

  const catalogEntry = getConnectorProvider(stateRecord.provider);
  if (!catalogEntry?.oauth && !catalogEntry?.ecomSdkPlatform) {
    return NextResponse.redirect(`${redirectBase}?oauth_error=unknown_provider`);
  }

  const pendingConfig = (stateRecord.pendingConfig ?? {}) as Record<string, string>;
  const clientSecret = stateRecord.pendingClientSecret ?? "";
  const credentialsFieldKey = catalogEntry.fields.find((f) => f.location === "credentials")?.key ?? "clientSecret";
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/connectors/oauth/callback`;

  if (catalogEntry.ecomSdkPlatform) {
    try {
      const result = await exchangeEcomCode(
        catalogEntry.ecomSdkPlatform,
        pendingConfig,
        { [credentialsFieldKey]: clientSecret },
        code,
        { shopId: shopIdParam, state }
      );
      if (!result.accessToken) {
        return NextResponse.redirect(`${redirectBase}?oauth_error=no_access_token`);
      }

      const tokenExpiresAt = new Date(Date.now() + (result.expiresIn ?? 3600) * 1000).toISOString();
      const finalConfig = result.shopId ? { ...pendingConfig, shopId: result.shopId } : pendingConfig;
      const credentials = {
        [credentialsFieldKey]: clientSecret,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt,
      };

      if (stateRecord.connectorId) {
        await prisma.connector.update({
          where: { id: stateRecord.connectorId },
          data: { status: "connected", lastError: null, credentials, config: finalConfig },
        });
      } else {
        await prisma.connector.create({
          data: {
            companyId: auth.companyId,
            provider: stateRecord.provider,
            name: stateRecord.pendingName || `${catalogEntry.name} connection`,
            authType: "oauth2",
            status: "connected",
            config: finalConfig,
            credentials,
          },
        });
      }

      return NextResponse.redirect(`${redirectBase}?connected=${encodeURIComponent(stateRecord.provider)}`);
    } catch (error) {
      logger.error("Connector e-commerce OAuth callback failed:", error);
      return NextResponse.redirect(`${redirectBase}?oauth_error=callback_failed`);
    }
  }

  try {
    const tokenUrl = fillUrlTemplate(catalogEntry.oauth!.tokenUrlTemplate, pendingConfig);
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: pendingConfig.clientId ?? "",
      client_secret: clientSecret,
    };
    if (stateRecord.codeVerifier) params.code_verifier = stateRecord.codeVerifier;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("Connector OAuth token exchange failed:", undefined, { status: response.status, body: body.slice(0, 500) });
      return NextResponse.redirect(`${redirectBase}?oauth_error=token_exchange_failed`);
    }

    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!json.access_token) {
      return NextResponse.redirect(`${redirectBase}?oauth_error=no_access_token`);
    }

    const tokenExpiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
    const credentials = {
      clientSecret,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenExpiresAt,
      scope: json.scope,
    };

    if (stateRecord.connectorId) {
      await prisma.connector.update({
        where: { id: stateRecord.connectorId },
        data: { status: "connected", lastError: null, credentials, config: pendingConfig },
      });
    } else {
      await prisma.connector.create({
        data: {
          companyId: auth.companyId,
          provider: stateRecord.provider,
          name: stateRecord.pendingName || `${catalogEntry.name} connection`,
          authType: "oauth2",
          status: "connected",
          config: pendingConfig,
          credentials,
        },
      });
    }

    return NextResponse.redirect(`${redirectBase}?connected=${encodeURIComponent(stateRecord.provider)}`);
  } catch (error) {
    logger.error("Connector OAuth callback failed:", error);
    return NextResponse.redirect(`${redirectBase}?oauth_error=callback_failed`);
  }
}
