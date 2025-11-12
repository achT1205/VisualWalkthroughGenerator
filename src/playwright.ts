/**
 * Playwright integration for screenshot capture
 */

import { chromium, Browser, Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { Config } from "./config.js";

export interface ScreenshotResult {
  url: string;
  title: string;
  filename: string;
  timestamp: Date;
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100) || "untitled";
}

/**
 * Capture screenshots for a list of URLs
 */
export async function captureScreenshots(
  urls: string[],
  config: Config
): Promise<ScreenshotResult[]> {
  const browser = await chromium.launch({
    headless: true,
  });

  // Use a browser context to persist cookies/session between pages
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();
  const results: ScreenshotResult[] = [];

  // Ensure images directory exists
  if (!existsSync(config.imagesDir)) {
    mkdirSync(config.imagesDir, { recursive: true });
  }

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`📸 [${i + 1}/${urls.length}] Capturing: ${url}`);

      try {
        // Try navigation with networkidle first, fallback to load if it times out
        const timeout = config.screenshotOptions.timeout || 60000; // Default to 60s
        
        try {
          await page.goto(url, {
            waitUntil: "networkidle",
            timeout: timeout,
          });
        } catch (networkIdleError) {
          // If networkidle times out, try with 'load' (less strict)
          console.log(`   ⚠️  networkidle timeout, trying 'load' strategy...`);
          try {
            await page.goto(url, {
              waitUntil: "load",
              timeout: timeout,
            });
          } catch (loadError) {
            // If load also fails, try domcontentloaded (fastest)
            console.log(`   ⚠️  load timeout, trying 'domcontentloaded' strategy...`);
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: Math.min(timeout, 30000), // Shorter timeout for last attempt
            });
          }
        }

        // Wait for optional selector if specified
        if (config.screenshotOptions.waitForSelector) {
          try {
            await page.waitForSelector(config.screenshotOptions.waitForSelector, {
              timeout: 10000,
            });
          } catch (selectorError) {
            console.log(`   ⚠️  Selector "${config.screenshotOptions.waitForSelector}" not found, continuing anyway...`);
          }
        }

        // Wait a bit for any dynamic content to render
        await page.waitForTimeout(2000);

        // Check if page has forms that need interaction (for screenshot capture)
        // This helps capture the correct page after form submission
        try {
          const { detectForms, autoFillForm } = await import("./formHandler.js");
          const hasForms = await detectForms(page);
          if (hasForms && config.crawl?.autoFillForms !== false) {
            console.log(`   📋 Form detected on ${url}, attempting to fill...`);
            await autoFillForm(page);
            await page.waitForTimeout(2000); // Wait after form submission
          }
        } catch (error) {
          // Ignore form handling errors during screenshot capture
        }

        // Get page title
        const title = (await page.title()) || "Untitled Page";
        const sanitizedTitle = sanitizeFilename(title);
        const filename = path.join(
          config.imagesDir,
          `${sanitizedTitle}_${Date.now()}.png`
        );

        // Take screenshot
        await page.screenshot({
          path: filename,
          fullPage: config.screenshotOptions.fullPage,
        });

        results.push({
          url,
          title,
          filename,
          timestamp: new Date(),
        });

        console.log(`✅ Captured: ${title}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`❌ Error capturing ${url}:`);
        console.error(`   ${errorMessage}`);

        // Try to capture a screenshot even if navigation partially failed
        try {
          const title = (await page.title()) || "Error Page";
          const sanitizedTitle = sanitizeFilename(title);
          const filename = path.join(
            config.imagesDir,
            `ERROR_${sanitizedTitle}_${Date.now()}.png`
          );
          await page.screenshot({
            path: filename,
            fullPage: true,
          });
          console.log(`   💾 Saved error screenshot to: ${filename}`);
        } catch (screenshotError) {
          console.error(`   ⚠️  Could not capture error screenshot`);
        }

        // Continue with next URL even if one fails
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
}

