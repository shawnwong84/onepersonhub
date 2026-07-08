import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest, parseJsonResponse } from "../helpers/request";
import { CORE_MODULE_SLUGS } from "@/lib/marketplace/catalog";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("core module protection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("declares customer-care and reporter-agent as core", () => {
    expect(CORE_MODULE_SLUGS).toContain("customer-care");
    expect(CORE_MODULE_SLUGS).toContain("reporter-agent");
  });

  it.each(CORE_MODULE_SLUGS)("rejects uninstall of core module %s", async (slug) => {
    const { POST } = await import("@/app/api/marketplace/modules/[slug]/route");
    const request = createRequest(`/api/marketplace/modules/${slug}`, {
      method: "POST",
      body: { action: "uninstall" },
    });

    const response = await POST(request, params(slug));
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(String(data.error)).toContain("core module");
  });

  it.each(CORE_MODULE_SLUGS)("rejects disable of core module %s", async (slug) => {
    const { POST } = await import("@/app/api/marketplace/modules/[slug]/route");
    const request = createRequest(`/api/marketplace/modules/${slug}`, {
      method: "POST",
      body: { action: "disable" },
    });

    const response = await POST(request, params(slug));
    expect(response.status).toBe(400);
  });
});
