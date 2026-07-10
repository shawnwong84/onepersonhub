import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AGENT_STORAGE_STATE, type E2eFixtureIds } from "./fixtures";

test.use({ storageState: AGENT_STORAGE_STATE });

const fixtureIds: E2eFixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, "fixture-ids.json"), "utf-8")
);

test("order lifecycle: create, approve, fulfill, and confirm to the customer", async ({ page }) => {
  // page.evaluate's fetch() resolves relative to the current page URL, which
  // is about:blank until we navigate somewhere at least once.
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const title = `E2E Test Order ${Date.now()}`;

  // The "New record" modal doesn't expose a conversationId field (that's
  // set automatically for workflow-created records) — create the record via
  // the same API the UI calls, linked to our fixture conversation, so the
  // "send confirmation to customer" step (which requires a conversationId)
  // is reachable, then drive every lifecycle transition through the UI.
  const recordId: string = await page.evaluate(
    async ({ conversationId, title }) => {
      const res = await fetch("/api/modules/orders/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: "order",
          title,
          status: "draft",
          conversationId,
          data: { customer: "E2E Assigned Customer", items: "1x Widget", quantity: 1 },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to create order record");
      return body.id;
    },
    { conversationId: fixtureIds.assignedConversationId, title }
  );

  await page.goto(`/modules/orders/records/${recordId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // The status pill next to the title has a distinct look from any other
  // "Draft"/"Confirmed"/etc text on the page (e.g. dropdown options).
  const statusBadge = page.locator("span.bg-owly-primary-50");
  await expect(statusBadge).toHaveText("Draft");

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(statusBadge).toHaveText("Pending approval", { timeout: 10_000 });

  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(statusBadge).toHaveText("Confirmed", { timeout: 10_000 });

  await page.getByRole("button", { name: "Mark fulfilled" }).click();
  await expect(statusBadge).toHaveText("Fulfilled", { timeout: 10_000 });

  await page.getByRole("button", { name: "Send confirmation to customer" }).click();
  await expect(page.getByText("Confirmation sent to the customer.")).toBeVisible({ timeout: 10_000 });

  // Confirm the message actually landed in the linked conversation.
  await page.goto(`/conversations?conversationId=${fixtureIds.assignedConversationId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(new RegExp(`order "${title}".*confirmed`, "i"))).toBeVisible({
    timeout: 10_000,
  });
});
