import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// "/" is dual-purpose (anonymous landing page vs. authenticated dashboard,
// see src/app/(dashboard)/page.tsx) so it stays crawlable; everything below
// is either an auth flow or requires a session anyway - disallowed here as
// defense-in-depth, not as the actual security boundary (that's requireAuth()).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/pricing",
          "/setup",
          "/billing",
          "/settings",
          "/admin",
          "/conversations",
          "/tickets",
          "/customers",
          "/team",
          "/channels",
          "/connectors",
          "/marketplace",
          "/modules",
          "/knowledge",
          "/flows",
          "/automation",
          "/reporter",
          "/analytics",
          "/activity",
          "/agents",
          "/approvals",
          "/webhooks",
          "/token-usage",
          "/sla",
          "/business-hours",
          "/canned-responses",
          "/api-docs",
        ],
      },
    ],
    sitemap: BASE_URL + "/sitemap.xml",
  };
}
