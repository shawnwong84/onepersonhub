import { test, expect } from "@playwright/test";
import { AGENT_STORAGE_STATE } from "./fixtures";

test.use({ storageState: AGENT_STORAGE_STATE });

test.describe("Reporter Agent chatbot", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reporter", { waitUntil: "domcontentloaded" });
    // Wait for the thread's existing history to finish loading before any
    // test captures a baseline message count — otherwise "before" can be
    // measured mid-load (0 or a partial count) and the +2-after-send
    // expectation never matches the fully-loaded, much longer history.
    await expect(page.getByText("Loading conversation...")).toHaveCount(0, { timeout: 10_000 });
  });

  // The chat thread is per-user and persists across test runs (there's no
  // "start a new thread" affordance in the UI), so historical messages from
  // prior runs stay on the page. Every assertion below waits for the message
  // count to grow past the user's own just-sent question before reading the
  // reply, and reads only that specific new message — never a page-wide
  // text search — so accumulated history (or the user's own question
  // happening to contain a keyword like "orders") can't cause a false
  // pass or a strict-mode multi-match failure.
  async function sendAndGetReply(page: import("@playwright/test").Page, message: string) {
    const bubbles = page.locator("p.whitespace-pre-wrap");
    const before = await bubbles.count();

    const input = page.getByPlaceholder(/ask the reporter agent/i);
    await input.fill(message);
    await input.press("Enter");

    // +2: the user's own message renders immediately, then the reply.
    await expect(bubbles).toHaveCount(before + 2, { timeout: 15_000 });
    return bubbles.last();
  }

  test("answers a question about an accessible module instead of refusing", async ({ page }) => {
    const reply = await sendAndGetReply(page, "What open orders need attention?");
    await expect(reply).not.toContainText(/don't have access/i);
  });

  test("refuses a question about a module outside the agent's access", async ({ page }) => {
    const reply = await sendAndGetReply(page, "What's overdue in Finance and Billing?");
    await expect(reply).toContainText(/don't have access to that module/i);
    await expect(reply).toContainText(/you can ask me about/i);
  });
});
