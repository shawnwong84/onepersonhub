import { test, expect } from "@playwright/test";
import { AGENT_STORAGE_STATE } from "./fixtures";

test.use({ storageState: AGENT_STORAGE_STATE });

test("agent replies in their assigned conversation and the message shows a source badge", async ({ page }) => {
  await page.goto("/conversations", { waitUntil: "domcontentloaded" });
  await page.getByText("E2E Assigned Customer").click();

  const replyText = `E2E test reply ${Date.now()}`;
  const textarea = page.getByPlaceholder(/type your reply/i);
  await textarea.fill(replyText);
  await textarea.press("Enter");

  const sentMessage = page.getByText(replyText, { exact: true });
  await expect(sentMessage).toBeVisible({ timeout: 10_000 });

  // The bubble containing our reply should carry a source badge — dashboard
  // replies are recorded with role "admin", which getMessageSource() always
  // renders as an "Admin" / "Manual reply" badge. Scope to the badge's own
  // pill (bg-slate-100), not the bubble as a whole: the sender-name label
  // above the badge also literally reads "Admin".
  const bubble = sentMessage.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  const badge = bubble.locator(".bg-slate-100");
  await expect(badge).toContainText("Admin");
  await expect(badge).toContainText("Manual reply");
});
