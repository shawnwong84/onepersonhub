import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/features",
    "/security",
    "/integrations",
    "/about",
    "/use-cases",
    "/contact",
    "/request-demo",
  ];
  return routes.map((route) => ({
    url: BASE_URL + route,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.8,
  }));
}
