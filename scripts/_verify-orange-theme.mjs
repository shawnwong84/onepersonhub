import { chromium } from "playwright-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

await page.goto("http://localhost:3000/login", { waitUntil: "load" });
await page.waitForTimeout(500);
await page.screenshot({ path: "scripts/_theme-login.png" });

await page.fill('input[name="username"], input[type="text"]', "admin");
await page.fill('input[name="password"], input[type="password"]', "admin123");
await page.click('button[type="submit"]');
await page.waitForFunction(() => window.location.pathname === "/" || window.location.pathname === "/billing", { timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: "scripts/_theme-dashboard.png" });

await browser.close();
console.log("done");
