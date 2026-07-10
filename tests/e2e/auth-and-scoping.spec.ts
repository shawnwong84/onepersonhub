import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN_USERNAME,
  E2E_ADMIN_PASSWORD,
  E2E_AGENT_USERNAME,
  E2E_AGENT_PASSWORD,
  AGENT_STORAGE_STATE,
} from "./fixtures";

// These two specifically exercise the login flow itself, so they log in
// fresh through the UI rather than reusing a saved session. Every other e2e
// spec reuses the storageState global-setup already created.
test.describe("Login", () => {
  test("owner logs in and reaches the dashboard", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.fill("#username", E2E_ADMIN_USERNAME);
    await page.fill("#password", E2E_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL((url) => !url.pathname.includes("login"), { timeout: 15_000 });
  });

  test("scoped member logs in and reaches the dashboard", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.fill("#username", E2E_AGENT_USERNAME);
    await page.fill("#password", E2E_AGENT_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL((url) => !url.pathname.includes("login"), { timeout: 15_000 });
  });
});

test.describe("Member scoping", () => {
  test.use({ storageState: AGENT_STORAGE_STATE });

  test("scoped agent sees only their assigned conversation, not others", async ({ page }) => {
    await page.goto("/conversations", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("E2E Assigned Customer")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("E2E Unassigned Customer")).not.toBeVisible();
  });

  test("scoped agent's sidebar only lists the module they're assigned to", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Core modules (customer-care, reporter-agent) are readable by everyone;
    // "orders" is the only *non-core* module this agent was assigned.
    await expect(page.getByRole("link", { name: /orders/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /finance and billing/i })).toHaveCount(0);
  });
});
