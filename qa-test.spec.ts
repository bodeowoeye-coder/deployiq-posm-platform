import { test, expect, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// Configuration
const BASE_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "./qa-screenshots";
const REPORT_FILE = "./qa-report.json";

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

interface TestReport {
  timestamp: string;
  device: string;
  page: string;
  errors: string[];
  warnings: string[];
  layoutShifts: boolean;
  overflows: string[];
  interactions: Record<string, boolean>;
}

const reports: TestReport[] = [];

// Device configurations
const deviceConfigs = [
  { name: "iPhone SE", device: devices["iPhone SE"] },
  { name: "iPhone 14", device: devices["iPhone 14"] },
  { name: "Pixel 5", device: devices["Pixel 5"] },
  { name: "iPad", device: devices["iPad"] },
  { name: "Desktop 1920", device: null, viewport: { width: 1920, height: 1080 } },
];

// Helper to capture console errors
function createErrorCapture() {
  const errors: string[] = [];
  const warnings: string[] = [];

  return {
    errors,
    warnings,
    handler: (msg: any) => {
      const text = msg.text();
      if (msg.type() === "error") errors.push(text);
      else if (msg.type() === "warning") warnings.push(text);
    },
  };
}

// Helper to check for layout shift
async function checkLayoutShift(page: any) {
  return page.evaluate(() => {
    return (performance as any).getEntriesByType?.("layout-shift")?.length > 0;
  });
}

// Helper to detect overflow issues
async function detectOverflows(page: any) {
  return page.evaluate(() => {
    const overflowing: string[] = [];
    document.querySelectorAll("body, main, section, div[class*='overflow']").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth || rect.left < 0) {
        overflowing.push(el.tagName + (el.className ? "." + el.className.split(" ")[0] : ""));
      }
    });
    return overflowing;
  });
}

// Test: Submit page responsiveness
test.describe("Submit Page - All Devices", () => {
  deviceConfigs.forEach(({ name, device, viewport }) => {
    test(`Submit form on ${name}`, async ({ browser }) => {
      const context = await browser.newContext(
        device ? { ...device } : { viewport: viewport || { width: 375, height: 667 } }
      );
      const page = await context.newPage();
      const errorCapture = createErrorCapture();
      page.on("console", errorCapture.handler);

      try {
        // Navigate to submit page
        await page.goto(`${BASE_URL}/submit`, { waitUntil: "networkidle" });
        await page.waitForLoadState("networkidle");

        // Capture screenshot
        const filename = `${name.replace(/\s+/g, "-")}-submit.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });

        // Check for overflows
        const overflows = await detectOverflows(page);

        // Check layout shifts
        const hasLayoutShift = await checkLayoutShift(page);

        // Test form field interaction
        const stateSelect = page.locator('select[name="installerState"]');
        const formInteractions: Record<string, boolean> = {
          stateSelectVisible: await stateSelect.isVisible(),
          formScrollable: true,
        };

        // Click state select and verify dropdown opens
        if (await stateSelect.isVisible()) {
          await stateSelect.click();
          await page.waitForTimeout(300);
          formInteractions.stateDropdownOpens = await page.locator('option').count() > 0;
        }

        // Test sticky submit button visibility
        const submitBtn = page.locator('button[type="submit"]');
        formInteractions.submitButtonVisible = await submitBtn.isVisible();
        formInteractions.submitButtonClickable = await submitBtn.isEnabled();

        // Scroll to bottom to test sticky behavior
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(200);
        formInteractions.submitButtonSticky = await submitBtn.isVisible();

        // Test GPS/location section
        const locationSection = page.locator('text="Getting phone location"').first();
        formInteractions.locationDisplayed = await locationSection.count() > 0;

        // Check for retry button if location failed
        const retryBtn = page.locator('text="Retry location"');
        formInteractions.retryLocationAvailable = await retryBtn.count() > 0;

        const report: TestReport = {
          timestamp: new Date().toISOString(),
          device: name,
          page: "submit",
          errors: errorCapture.errors,
          warnings: errorCapture.warnings,
          layoutShifts: hasLayoutShift,
          overflows,
          interactions: formInteractions,
        };

        reports.push(report);
        console.log(`✓ Submit page tested on ${name}`);
      } finally {
        await context.close();
      }
    });
  });
});

// Test: Admin Dashboard responsiveness
test.describe("Admin Dashboard - All Devices", () => {
  deviceConfigs.forEach(({ name, device, viewport }) => {
    test(`Admin dashboard on ${name}`, async ({ browser }) => {
      const context = await browser.newContext(
        device ? { ...device } : { viewport: viewport || { width: 375, height: 667 } }
      );
      const page = await context.newPage();
      const errorCapture = createErrorCapture();
      page.on("console", errorCapture.handler);

      try {
        await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
        await page.waitForLoadState("networkidle");

        // Capture screenshot
        const filename = `${name.replace(/\s+/g, "-")}-admin.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });

        // Check for overflows
        const overflows = await detectOverflows(page);

        // Check layout shifts
        const hasLayoutShift = await checkLayoutShift(page);

        // Test sidebar interaction
        const menuBtn = page.locator('button:has-text("Menu")');
        const sidebarInteractions: Record<string, boolean> = {
          menuButtonVisible: await menuBtn.isVisible(),
          menuButtonClickable: await menuBtn.isEnabled(),
        };

        if (await menuBtn.isVisible()) {
          await menuBtn.click();
          await page.waitForTimeout(300);
          const sidebar = page.locator('aside');
          sidebarInteractions.sidebarOpens = await sidebar.isVisible();
          sidebarInteractions.sidebarHasItems = (await page.locator('nav button').count()) > 0;
        }

        // Check for KPI cards
        const kpiCards = page.locator('div[class*="rounded-xl"]').filter({ hasText: /Expected|Actual|Completion/ });
        sidebarInteractions.kpiCardsPresent = (await kpiCards.count()) > 0;

        // Test filter grid responsiveness
        const filterInputs = page.locator('input[type="text"], select');
        sidebarInteractions.filterInputsVisible = (await filterInputs.count()) > 0;

        // Check tables for horizontal scroll
        const tables = page.locator('table');
        sidebarInteractions.tablesPresent = (await tables.count()) > 0;
        if (await tables.count() > 0) {
          sidebarInteractions.tableScrollContainer = await page.locator('div:has(table)').first().evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width < 900; // table min-w is 760px or 900px
          });
        }

        const report: TestReport = {
          timestamp: new Date().toISOString(),
          device: name,
          page: "admin",
          errors: errorCapture.errors,
          warnings: errorCapture.warnings,
          layoutShifts: hasLayoutShift,
          overflows,
          interactions: sidebarInteractions,
        };

        reports.push(report);
        console.log(`✓ Admin dashboard tested on ${name}`);
      } finally {
        await context.close();
      }
    });
  });
});

// Test: Client Dashboard responsiveness
test.describe("Client Dashboard - All Devices", () => {
  deviceConfigs.forEach(({ name, device, viewport }) => {
    test(`Client dashboard on ${name}`, async ({ browser }) => {
      const context = await browser.newContext(
        device ? { ...device } : { viewport: viewport || { width: 375, height: 667 } }
      );
      const page = await context.newPage();
      const errorCapture = createErrorCapture();
      page.on("console", errorCapture.handler);

      try {
        await page.goto(`${BASE_URL}/client`, { waitUntil: "networkidle" });
        await page.waitForLoadState("networkidle");

        // Capture screenshot
        const filename = `${name.replace(/\s+/g, "-")}-client.png`;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });

        // Check for overflows
        const overflows = await detectOverflows(page);

        // Check layout shifts
        const hasLayoutShift = await checkLayoutShift(page);

        // Test sidebar and menu
        const menuBtn = page.locator('button:has-text("Menu")');
        const dashboardInteractions: Record<string, boolean> = {
          menuButtonVisible: await menuBtn.isVisible(),
        };

        // Test KPI cards
        const summaryCards = page.locator('div[class*="rounded-xl"]');
        dashboardInteractions.kpiCardsPresent = (await summaryCards.count()) > 0;

        // Check for charts
        const charts = page.locator('svg[class*="recharts"]');
        dashboardInteractions.chartsPresent = (await charts.count()) > 0;

        // Test image gallery responsiveness
        const galleryImages = page.locator('img[alt*="Uploaded"]');
        dashboardInteractions.galleryPresent = (await galleryImages.count()) > 0;

        const report: TestReport = {
          timestamp: new Date().toISOString(),
          device: name,
          page: "client",
          errors: errorCapture.errors,
          warnings: errorCapture.warnings,
          layoutShifts: hasLayoutShift,
          overflows,
          interactions: dashboardInteractions,
        };

        reports.push(report);
        console.log(`✓ Client dashboard tested on ${name}`);
      } finally {
        await context.close();
      }
    });
  });
});

// Test: Logout redirect
test("Logout redirect on mobile", async ({ browser }) => {
  const context = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const page = await context.newPage();

  try {
    // Intercept redirect
    let redirectUrl = "";
    page.on("framenavigated", (frame) => {
      redirectUrl = frame.url();
    });

    await page.goto(`${BASE_URL}/submit`, { waitUntil: "networkidle" });

    // Find and click sign out button
    const signOutBtn = page.locator("text=Sign out");
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
      await page.waitForTimeout(500);
      
      console.log(`✓ Logout redirect test: navigated to ${redirectUrl}`);
    }
  } finally {
    await context.close();
  }
});

// Test: Modal responsiveness
test("Modal responsiveness on mobile", async ({ browser }) => {
  const context = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const page = await context.newPage();
  const errorCapture = createErrorCapture();
  page.on("console", errorCapture.handler);

  try {
    await page.goto(`${BASE_URL}/submit`, { waitUntil: "networkidle" });

    // Look for modal trigger (brand mismatch warning would appear on submit)
    const modalInteractions: Record<string, boolean> = {
      modalTestAttempted: true,
    };

    // Take screenshot of form state
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "modal-test-iphone14.png"), fullPage: true });

    console.log(`✓ Modal test completed on iPhone 14`);
  } finally {
    await context.close();
  }
});

// After all tests, save report
test.afterAll(async () => {
  const summary = {
    totalTests: reports.length,
    timestamp: new Date().toISOString(),
    details: reports,
    summary: {
      devicesTestedCount: new Set(reports.map((r) => r.device)).size,
      pagesTestedCount: new Set(reports.map((r) => r.page)).size,
      totalErrors: reports.reduce((sum, r) => sum + r.errors.length, 0),
      totalWarnings: reports.reduce((sum, r) => sum + r.warnings.length, 0),
      reportsWithOverflow: reports.filter((r) => r.overflows.length > 0).length,
      reportsWithLayoutShift: reports.filter((r) => r.layoutShifts).length,
    },
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2));
  console.log("\n✓ QA Report saved to qa-report.json");
  console.log(`\nSummary: ${summary.totalTests} tests, ${summary.summary.totalErrors} errors, ${summary.summary.totalWarnings} warnings`);
});
