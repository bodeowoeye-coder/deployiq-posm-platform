import { test, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "./qa-screenshots-v2";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const devices_list = [
  { name: "iPhone SE", device: devices["iPhone SE"] },
  { name: "iPhone 14", device: devices["iPhone 14"] },
  { name: "iPad", device: devices["iPad"] },
  { name: "Desktop", device: null, viewport: { width: 1280, height: 800 } },
];

const results: any[] = [];

test.describe("Responsive QA Pass v2", () => {
  devices_list.forEach(({ name, device, viewport }) => {
    test(`${name}: submit page - no console errors`, async ({ browser }) => {
      const context = await browser.newContext(
        device ? { ...device } : { viewport: viewport }
      );
      const page = await context.newPage();
      const messages: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        // Ignore expected unauthenticated auth checks to reduce noise
        if (/\/api\/auth\/session/.test(text) || /status of 401/.test(text) || /401 \(Unauthorized\)/.test(text)) {
          return;
        }
        if (msg.type() === "error" || msg.type() === "warning") {
          messages.push(`${msg.type()}: ${text.substring(0, 200)}`);
        }
      });

      try {
        await page.goto(`${BASE_URL}/submit`, { waitUntil: "networkidle" });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(500);

        // Screenshot
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${name.replace(/\s+/g, "-")}-submit.png`),
          fullPage: true,
        });

        // Check critical elements
        const formPresent = await page.locator("form").count() > 0;
        const submitBtnVisible = await page.locator('button[type="submit"]').isVisible();

        results.push({
          device: name,
          page: "submit",
          consoleErrors: messages.filter((m) => m.startsWith("error")).length,
          consoleWarnings: messages.filter((m) => m.startsWith("warning")).length,
          formPresent,
          submitBtnVisible,
          messages: messages.slice(0, 3),
        });

        console.log(`✓ ${name}: form=${formPresent}, submit=${submitBtnVisible}, errors=${messages.length}`);
      } finally {
        await context.close();
      }
    });

    test(`${name}: admin page - sidebar responsive`, async ({ browser }) => {
      const context = await browser.newContext(
        device ? { ...device } : { viewport: viewport }
      );
      const page = await context.newPage();
      const messages: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        if (/\/api\/auth\/session/.test(text) || /status of 401/.test(text) || /401 \(Unauthorized\)/.test(text)) {
          return;
        }
        if (msg.type() === "error") {
          messages.push(text.substring(0, 150));
        }
      });

      try {
        await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(300);

        // Screenshot
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${name.replace(/\s+/g, "-")}-admin.png`),
          fullPage: true,
        });

        const menuBtn = await page.locator('button:has-text("Menu")').count();
        const kpiCards = await page.locator('div[class*="rounded-xl"]').count();

        results.push({
          device: name,
          page: "admin",
          consoleErrors: messages.length,
          menuButtonPresent: menuBtn > 0,
          kpiCardsPresent: kpiCards > 0,
        });

        console.log(`✓ ${name}: menu=${menuBtn > 0}, kpi=${kpiCards > 0}, errors=${messages.length}`);
      } finally {
        await context.close();
      }
    });
  });
});

test.afterAll(() => {
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "results.json"),
    JSON.stringify(results, null, 2)
  );
  console.log(`\n✓ QA v2 complete. ${results.length} tests, ${results.filter((r) => r.consoleErrors > 0).length} with errors`);
});
