import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const API_VERSION = "2026-04-07";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-API-Version": API_VERSION,
};

// CSP and HSTS are production-only: the Next dev server needs 'unsafe-eval'
// for HMR/source maps, and HSTS pinning a browser to HTTPS is wrong for a
// plain-http local dev server.
// Next.js's App Router streams RSC payloads via inline `<script>` tags on every
// page, so a strict nonce-based script-src (the "right" CSP) would require
// disabling static rendering app-wide — a real, documented tradeoff
// (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// We take Next's own documented "Without Nonces" fallback instead: 'unsafe-inline'
// on script-src, which still blocks loading external script/img/connect/font
// origins outside our own and framing by other sites.
const PRODUCTION_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

const CORS_ORIGIN = process.env.CORS_ORIGIN || "";

function generateRequestId(): string {
  return crypto.randomUUID();
}

function addHeaders(
  response: NextResponse,
  requestId: string,
  rateLimit?: { limit: number; remaining: number; resetAt: number }
): NextResponse {
  // Security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  if (process.env.NODE_ENV === "production") {
    for (const [key, value] of Object.entries(PRODUCTION_SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
  }

  // Request ID
  response.headers.set("X-Request-Id", requestId);

  // Rate limit headers
  if (rateLimit) {
    response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
    response.headers.set("X-RateLimit-Remaining", String(Math.max(0, rateLimit.remaining)));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
  }

  // CORS
  if (CORS_ORIGIN) {
    response.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id");
    response.headers.set("Access-Control-Expose-Headers", "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-API-Version");
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}

/**
 * NextResponse.next() that forwards the request id to the route handler via
 * a request header, so requireAuth (called at the top of virtually every
 * protected route) can pick it up and attach it to every log line emitted
 * while handling this request — without touching each route file.
 */
function nextWithRequestId(request: NextRequest, requestId: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.next({ request: { headers } });
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getApiRateLimit(pathname: string, method: string) {
  if (pathname.startsWith("/api/realtime")) {
    return {
      keyPrefix: "realtime",
      config: RATE_LIMITS.realtime,
    };
  }

  if (method === "GET" || method === "HEAD") {
    return {
      keyPrefix: "api-read",
      config: RATE_LIMITS.apiRead,
    };
  }

  return {
    keyPrefix: "api-write",
    config: RATE_LIMITS.apiWrite,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") || generateRequestId();

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // CORS preflight
  if (request.method === "OPTIONS" && CORS_ORIGIN) {
    return addHeaders(new NextResponse(null, { status: 204 }), requestId);
  }

  // Public paths that don't require auth
  const publicPaths = [
    "/login",
    "/setup",
    "/register",
    "/features",
    "/pricing",
    "/security",
    "/integrations",
    "/about",
    "/use-cases",
    "/contact",
    "/request-demo",
    "/api-docs",
    "/sitemap.xml",
    "/robots.txt",
    "/api/auth",
    "/api/register",
    "/api/demo-request",
    "/api/health",
    "/api/openapi.json",
  ];
  // "/" is exact-match public (not prefix, or every path would match): it
  // serves the marketing landing page to anonymous visitors and the real
  // dashboard to authenticated ones - the branch happens server-side in
  // (dashboard)/layout.tsx and page.tsx, not here.
  const isPublic = pathname === "/" || publicPaths.some((p) => pathname.startsWith(p));

  // Channel webhook endpoints (authenticated via provider signatures, not JWT)
  if (
    pathname.startsWith("/api/channels/phone/") ||
    pathname.startsWith("/api/channels/sms") ||
    pathname.startsWith("/api/channels/telegram")
  ) {
    return addHeaders(nextWithRequestId(request, requestId), requestId);
  }

  // Rate limiting for auth mutations. Session reads are handled by the
  // dashboard read budget so normal page bootstrapping does not lock users out.
  if (pathname.startsWith("/api/auth") && request.method !== "GET") {
    const ip = getClientIp(request);
    const rateResult = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", requestId } },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return addHeaders(response, requestId, { limit: RATE_LIMITS.auth.maxRequests, remaining: 0, resetAt: rateResult.resetAt });
    }

    return addHeaders(nextWithRequestId(request, requestId), requestId, {
      limit: RATE_LIMITS.auth.maxRequests,
      remaining: rateResult.remaining,
      resetAt: rateResult.resetAt,
    });
  }

  if (isPublic) {
    return addHeaders(nextWithRequestId(request, requestId), requestId);
  }

  // API rate limiting
  let apiRateInfo: { limit: number; remaining: number; resetAt: number } | undefined;
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    const { keyPrefix, config } = getApiRateLimit(pathname, request.method);
    const rateResult = await checkRateLimit(`${keyPrefix}:${ip}`, config);

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", requestId } },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return addHeaders(response, requestId, { limit: config.maxRequests, remaining: 0, resetAt: rateResult.resetAt });
    }

    apiRateInfo = {
      limit: config.maxRequests,
      remaining: rateResult.remaining,
      resetAt: rateResult.resetAt,
    };
  }

  // Check for auth token (cookie) or API key (header)
  const token = request.cookies.get("owly-token")?.value;
  const apiKey = request.headers.get("x-api-key");

  if (!token && !apiKey) {
    if (pathname.startsWith("/api/")) {
      return addHeaders(
        NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } },
          { status: 401 }
        ),
        requestId,
        apiRateInfo
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // API key auth is validated in route handlers (requireAuth), just pass through
  if (apiKey && !token) {
    return addHeaders(nextWithRequestId(request, requestId), requestId, apiRateInfo);
  }

  // Verify JWT structure
  const parts = (token || "").split(".");
  if (parts.length !== 3) {
    if (pathname.startsWith("/api/")) {
      return addHeaders(
        NextResponse.json(
          { error: { code: "INVALID_TOKEN", message: "Invalid authentication token", requestId } },
          { status: 401 }
        ),
        requestId,
        apiRateInfo
      );
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("owly-token");
    return response;
  }

  return addHeaders(nextWithRequestId(request, requestId), requestId, apiRateInfo);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
