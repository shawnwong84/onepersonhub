import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixtures";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Marketplace install/uninstall", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
  });

  test("installs and then uninstalls a normal module", async ({ page }) => {
    await page
      .locator("button", { has: page.getByText("Products", { exact: true }) })
      .first()
      .click();

    await expect(page.getByRole("button", { name: "Install module" })).toBeVisible();
    await page.getByRole("button", { name: "Install module" }).click();
    await expect(page.getByRole("button", { name: "Uninstall" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Uninstall" }).click();
    await expect(page.getByRole("button", { name: "Install module" })).toBeVisible({ timeout: 10_000 });
  });

  test("a core module cannot be uninstalled", async ({ page }) => {
    await page
      .locator("button", { has: page.getByText("Reporter Agent", { exact: true }) })
      .first()
      .click();

    await expect(page.getByText("Core", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Uninstall" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
  });
});
