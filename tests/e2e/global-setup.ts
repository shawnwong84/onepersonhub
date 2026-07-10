import { chromium, type FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  E2E_ADMIN_USERNAME,
  E2E_ADMIN_PASSWORD,
  E2E_AGENT_USERNAME,
  E2E_AGENT_PASSWORD,
  ADMIN_STORAGE_STATE,
  AGENT_STORAGE_STATE,
  type E2eFixtureIds,
} from "./fixtures";

/**
 * Seeds a deterministic fixture set for the e2e suite by driving the app's
 * own APIs (as an authenticated admin), rather than writing rows directly
 * into Postgres. This exercises the same validated code paths the app
 * itself uses (module install, credential issuance, assignment) instead of
 * duplicating their logic, and stays correct automatically as that logic
 * evolves. Requires `npm run db:seed` (or an equivalent baseline) to have
 * already created the first admin account (setup flow requirement).
 *
 * Also logs in once as admin and once as the e2e agent and saves each
 * session's storageState to disk — every spec file except the dedicated
 * login tests reuses these instead of logging in again, so the suite makes
 * only a small, fixed number of real POST /api/auth calls regardless of how
 * many specs run, well clear of the 5-per-minute auth rate limit.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL as string;
  if (!baseURL) throw new Error("playwright.config.ts must set use.baseURL");

  await mkdir(path.join(__dirname, ".auth"), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill("#username", E2E_ADMIN_USERNAME);
  await page.fill("#password", E2E_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15_000 });
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });

  const ids: E2eFixtureIds = await page.evaluate(
    async ({ username, password }) => {
      async function json(res: Response) {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
        return res.json();
      }

      // Department (reuse the first one if the base seed already created some).
      const depsBody = await json(await fetch("/api/team/departments?limit=1"));
      let departmentId = (depsBody.data || depsBody)[0]?.id as string | undefined;
      if (!departmentId) {
        const created = await json(
          await fetch("/api/team/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "E2E Dept", email: "e2e-dept@example.com" }),
          })
        );
        departmentId = created.id;
      }

      // Find-or-create the scoped e2e agent.
      const membersBody = await json(await fetch("/api/team/members?limit=100"));
      const existing = (membersBody.data || []).find(
        (m: { username?: string }) => m.username === username
      );
      const member =
        existing ||
        (await json(
          await fetch("/api/team/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "E2E Agent",
              email: "e2e-agent@example.com",
              departmentId,
            }),
          })
        ));

      await fetch(`/api/team/members/${member.id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rbacRole: "agent", isActive: true }),
      });

      // Ensure "orders" is installed, and the e2e agent has write access to it.
      const ordersState = await json(await fetch("/api/marketplace/modules/orders"));
      if (!ordersState.isInstalled) {
        await fetch("/api/marketplace/modules/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "install" }),
        });
      }
      await fetch(`/api/team/members/${member.id}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleSlug: "orders", access: "write" }),
      });

      // Ensure "products" starts uninstalled — the marketplace test installs
      // and uninstalls it itself, and needs a known clean starting state.
      const productsState = await json(await fetch("/api/marketplace/modules/products"));
      if (productsState.isInstalled) {
        await fetch("/api/marketplace/modules/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "uninstall", force: true }),
        });
      }

      // One conversation assigned to the e2e agent (conversation-reply +
      // scoping-inclusion tests), one left unassigned (scoping-exclusion).
      // Find-or-create both so re-running the suite doesn't accumulate
      // duplicate conversations with the same customer name.
      async function findOrCreateConversation(customerName: string, customerContact: string) {
        const searchBody = await json(
          await fetch(`/api/conversations?search=${encodeURIComponent(customerName)}&limit=5`)
        );
        const existingConv = (searchBody.data || []).find(
          (c: { customerName?: string }) => c.customerName === customerName
        );
        if (existingConv) return existingConv;
        return json(
          await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "email", customerName, customerContact }),
          })
        );
      }

      const assignedConversation = await findOrCreateConversation(
        "E2E Assigned Customer",
        "e2e-assigned@customer.example.com"
      );
      await fetch(`/api/conversations/${assignedConversation.id}/assignment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });

      const unassignedConversation = await findOrCreateConversation(
        "E2E Unassigned Customer",
        "e2e-unassigned@customer.example.com"
      );

      return {
        memberId: member.id,
        assignedConversationId: assignedConversation.id,
        unassignedConversationId: unassignedConversation.id,
      };
    },
    { username: E2E_AGENT_USERNAME, password: E2E_AGENT_PASSWORD }
  );

  await writeFile(path.join(__dirname, "fixture-ids.json"), JSON.stringify(ids, null, 2));

  // Fresh context for the agent login so its storageState doesn't inherit
  // the admin session's cookies.
  const agentPage = await browser.newPage({ baseURL });
  await agentPage.goto("/login", { waitUntil: "domcontentloaded" });
  await agentPage.fill("#username", E2E_AGENT_USERNAME);
  await agentPage.fill("#password", E2E_AGENT_PASSWORD);
  await agentPage.click('button[type="submit"]');
  await agentPage.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15_000 });
  await agentPage.context().storageState({ path: AGENT_STORAGE_STATE });

  await browser.close();
}
