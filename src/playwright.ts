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
  hasForm?: boolean;
  beforeFormFilename?: string; // Screenshot before form submission
  afterFormFilename?: string; // Screenshot after form submission
}

/**
 * Normalize URL to avoid duplicates
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
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

  // Track captured URLs to avoid duplicates
  const capturedUrls = new Set<string>();

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const normalizedUrl = normalizeUrl(url);
      
      // Skip if already captured
      if (capturedUrls.has(normalizedUrl)) {
        console.log(`📸 [${i + 1}/${urls.length}] Skipping duplicate: ${url}`);
        continue;
      }
      
      capturedUrls.add(normalizedUrl);
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

        // Get page title first
        const title = (await page.title()) || "Untitled Page";
        const sanitizedTitle = sanitizeFilename(title);

        // Check if page has forms that need interaction
        let hasForms = false;
        let beforeFormFilename: string | undefined;
        let afterFormFilename: string | undefined;

        try {
          const { detectForms, autoFillForm } = await import("./formHandler.js");
          hasForms = await detectForms(page);
          
          if (hasForms && config.crawl?.autoFillForms !== false) {
            console.log(`   📋 Form detected, capturing before and after...`);
            
            // Create comprehensive filename for before form (based on URL path)
            // Extract meaningful path from URL (e.g., /onboarding -> onboarding_before_form)
            let urlPath = '';
            try {
              const urlObj = new URL(url);
              urlPath = urlObj.pathname.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '_') || 'home';
            } catch {
              urlPath = 'page';
            }
            const beforeTitle = urlPath ? `${urlPath}_before_form` : `${sanitizedTitle}_before_form`;
            const beforeSanitizedTitle = sanitizeFilename(beforeTitle);
            
            // Capture BEFORE form submission
            beforeFormFilename = path.join(
              config.imagesDir,
              `${beforeSanitizedTitle}_${Date.now()}.png`
            );
            await page.screenshot({
              path: beforeFormFilename,
              fullPage: config.screenshotOptions.fullPage,
            });
            console.log(`   📸 Captured before form: ${beforeSanitizedTitle}`);

            // Fill and submit form
            const formFilled = await autoFillForm(page);
            
            if (formFilled) {
              // Wait for navigation or page update
              await page.waitForTimeout(3000);
              
              // Check if URL changed after form submission
              const currentUrl = normalizeUrl(page.url());
              const originalNormalized = normalizeUrl(url);
              
              // Get new title after form submission (might have changed)
              const newTitle = (await page.title()) || title;
              
              // Create comprehensive filename based on URL path and action
              const urlPath = new URL(currentUrl).pathname.replace(/^\//, '').replace(/\//g, '_') || 'home';
              const comprehensiveTitle = urlPath ? `${urlPath}_after_form` : `form_submitted_${Date.now()}`;
              const newSanitizedTitle = sanitizeFilename(comprehensiveTitle);
              
              // Capture AFTER form submission
              afterFormFilename = path.join(
                config.imagesDir,
                `${newSanitizedTitle}_${Date.now()}.png`
              );
              await page.screenshot({
                path: afterFormFilename,
                fullPage: config.screenshotOptions.fullPage,
              });
              console.log(`   📸 Captured after form: ${newSanitizedTitle}`);
              
              // Use the post-form state as the main screenshot
              // Use the actual current URL, not the original
              const finalUrl = currentUrl !== originalNormalized ? currentUrl : url;
              results.push({
                url: finalUrl,
                title: newTitle,
                filename: afterFormFilename,
                timestamp: new Date(),
                hasForm: true,
                beforeFormFilename,
                afterFormFilename,
              });
              
              console.log(`✅ Captured: ${newTitle} (with form action)`);
              
              // If URL changed, mark the new URL as captured to avoid duplicate
              if (currentUrl !== originalNormalized) {
                capturedUrls.add(currentUrl);
              }
            } else {
              // Form wasn't submitted, just use before screenshot
              results.push({
                url,
                title,
                filename: beforeFormFilename,
                timestamp: new Date(),
                hasForm: true,
                beforeFormFilename,
              });
              console.log(`✅ Captured: ${title} (form detected but not submitted)`);
            }
          } else {
            // No form, capture normally
            const filename = path.join(
              config.imagesDir,
              `${sanitizedTitle}_${Date.now()}.png`
            );

            await page.screenshot({
              path: filename,
              fullPage: config.screenshotOptions.fullPage,
            });

            results.push({
              url,
              title,
              filename,
              timestamp: new Date(),
              hasForm: false,
            });

            console.log(`✅ Captured: ${title}`);
          }
        } catch (error) {
          // Fallback: capture normally if form handling fails
          console.log(`   ⚠️  Form handling error, capturing normally: ${error}`);
          const filename = path.join(
            config.imagesDir,
            `${sanitizedTitle}_${Date.now()}.png`
          );

          await page.screenshot({
            path: filename,
            fullPage: config.screenshotOptions.fullPage,
          });

          results.push({
            url,
            title,
            filename,
            timestamp: new Date(),
            hasForm: false,
          });

          console.log(`✅ Captured: ${title}`);
        }
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

