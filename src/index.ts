/**
 * Main entry point for Visual Walkthrough Generator
 */

import "dotenv/config";
import { chromium } from "playwright";
import { captureScreenshots } from "./playwright.js";
import { describeScreenshot } from "./openaiClient.js";
import { buildMarkdown, type PageData } from "./markdownBuilder.js";
import { crawlWebsite } from "./crawler.js";
import {
  getUrlsFromArgs,
  defaultConfig,
  getCrawlConfig,
  type Config,
} from "./config.js";

/**
 * Main execution function
 */
async function main() {
  console.log("🎥 Visual Walkthrough Generator\n");

  let urls: string[] = [];
  const crawlConfig = getCrawlConfig();

  // Check if crawl mode is enabled
  if (crawlConfig.enabled) {
    const startUrls = getUrlsFromArgs();
    if (startUrls.length === 0) {
      console.error("❌ No starting URL provided for crawl mode.");
      console.log("Usage: npm run walkthrough <start-url> --crawl");
      process.exit(1);
    }

    const startUrl = startUrls[0]; // Use first URL as starting point
    console.log(`🕷️  Crawl mode enabled - discovering pages from: ${startUrl}\n`);

    // Launch browser for crawling
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    try {
      // Crawl the website
      const crawlResult = await crawlWebsite(page, startUrl, crawlConfig);
      urls = crawlResult.urls;

      if (urls.length === 0) {
        console.error("❌ No pages discovered during crawl. Exiting.");
        process.exit(1);
      }
    } finally {
      await context.close();
      await browser.close();
    }
  } else {
    // Manual URL mode
    urls = getUrlsFromArgs();
    if (urls.length === 0) {
      console.error("❌ No URLs provided. Please provide URLs as arguments or update config.ts");
      console.log("Usage: npm run walkthrough <url1> <url2> ...");
      console.log("   Or: npm run walkthrough <start-url> --crawl (to auto-discover pages)");
      process.exit(1);
    }
  }

  console.log(`📋 Processing ${urls.length} URL(s):`);
  urls.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
  console.log("");

  // Merge URLs into config
  const config: Config = {
    ...defaultConfig,
    urls,
    crawl: crawlConfig.enabled ? crawlConfig : undefined,
  };

  try {
    // Step 1: Capture screenshots
    console.log("📸 Step 1: Capturing screenshots...\n");
    const screenshots = await captureScreenshots(urls, config);

    if (screenshots.length === 0) {
      console.error("❌ No screenshots were captured. Exiting.");
      process.exit(1);
    }

    console.log(`\n✅ Captured ${screenshots.length} screenshot(s)\n`);

    // Step 2: Generate descriptions using GPT-4o Vision
    console.log("🤖 Step 2: Generating AI descriptions...\n");
    const pages: PageData[] = [];

    for (const screenshot of screenshots) {
      const description = await describeScreenshot(
        screenshot.filename,
        screenshot.title,
        screenshot.url
      );

      pages.push({
        title: screenshot.title,
        url: screenshot.url,
        filename: screenshot.filename,
        description,
        timestamp: screenshot.timestamp,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Generated ${pages.length} description(s)\n`);

    // Step 3: Build markdown documentation
    console.log("📝 Step 3: Building markdown documentation...\n");
    await buildMarkdown(pages, config);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ Walkthrough generation complete!");
    console.log("=".repeat(50));
    console.log(`📄 Documentation: ${config.outputFile}`);
    console.log(`🖼️  Screenshots: ${config.imagesDir}/`);
    console.log(`📊 Pages documented: ${pages.length}`);
    console.log("");
  } catch (error) {
    console.error("\n❌ Error during walkthrough generation:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

