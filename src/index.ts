/**
 * Main entry point for Visual Walkthrough Generator
 */

import "dotenv/config";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { captureScreenshots } from "./playwright.js";
import { describeScreenshot } from "./openaiClient.js";
import { buildMarkdown, type PageData } from "./markdownBuilder.js";
import { crawlWebsite } from "./crawler.js";
import {
  analyzeCodebase,
  generateComprehensiveAnalysis,
  type CodeDocumentation,
} from "./codeAnalyzer.js";
import {
  getUrlsFromArgs,
  defaultConfig,
  getCrawlConfig,
  getCodeAnalysisConfig,
  type Config,
} from "./config.js";

/**
 * Main execution function
 */
async function main() {
  console.log("🎥 Visual Walkthrough Generator\n");

  // Ensure output directory exists
  if (!existsSync(defaultConfig.outputDir)) {
    mkdirSync(defaultConfig.outputDir, { recursive: true });
  }
  if (!existsSync(defaultConfig.imagesDir)) {
    mkdirSync(defaultConfig.imagesDir, { recursive: true });
  }

  let urls: string[] = [];
  const crawlConfig = getCrawlConfig();
  const codeAnalysisConfig = getCodeAnalysisConfig(); // Get early for route extraction

  // Mode 3: Codebase only (no URLs, no crawling)
  if (!crawlConfig.enabled && codeAnalysisConfig.enabled && codeAnalysisConfig.codebasePath) {
    console.log("📚 Codebase-only mode: Analyzing codebase without interface documentation\n");
    
    // Step 1: Analyze codebase
    console.log("📚 Step 1: Analyzing codebase...\n");
    
    // Phase 1: Extract code information (fast, no AI)
    console.log("   Phase 1: Extracting code structure...\n");
    const codeDocs = await analyzeCodebase(codeAnalysisConfig);
    console.log(`   ✅ Extracted information from ${codeDocs.length} file(s)\n`);
    
    // Phase 2: Generate comprehensive analysis (AI-powered)
    let comprehensiveAnalysis = undefined;
    if (codeDocs.length > 0) {
      console.log("   Phase 2: Generating comprehensive analysis...\n");
      comprehensiveAnalysis = await generateComprehensiveAnalysis(codeDocs);
      console.log("   ✅ Comprehensive analysis generated\n");
    }

    // Step 2: Build markdown documentation (codebase only)
    console.log("📝 Step 2: Building markdown documentation...\n");
    await buildMarkdown([], defaultConfig, codeDocs, comprehensiveAnalysis);

    console.log("\n==================================================");
    console.log("✅ Codebase documentation complete!");
    console.log("==================================================\n");
    console.log(`📄 Documentation: ${defaultConfig.outputFile}\n`);
    
    return; // Exit early
  }

  // Mode 1 & 2: Interface documentation (with or without code analysis)
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
      // If code analysis is enabled, extract routes first to help with crawling
      let routesFromCode: string[] = [];
      if (codeAnalysisConfig.enabled && codeAnalysisConfig.codebasePath) {
        console.log("   Extracting routes from codebase to improve crawling...\n");
        const codeDocs = await analyzeCodebase(codeAnalysisConfig);
        // Extract all routes found in code
        routesFromCode = codeDocs
          .filter((d) => d.routes && d.routes.length > 0)
          .flatMap((d) => d.routes || []);
        
        // Deduplicate routes
        routesFromCode = Array.from(new Set(routesFromCode));
        
        if (routesFromCode.length > 0) {
          console.log(`   Found ${routesFromCode.length} unique route(s) in codebase:`);
          routesFromCode.forEach((route, i) => {
            console.log(`      ${i + 1}. ${route}`);
          });
          console.log("");
        }
      }

      // Add routes to crawl config
      const enhancedCrawlConfig = {
        ...crawlConfig,
        routesFromCode,
      };

      // Crawl the website (with screenshot capture)
      const crawlResult = await crawlWebsite(page, startUrl, enhancedCrawlConfig, defaultConfig.imagesDir);
      
      // Deduplicate URLs using normalized URLs
      const urlSet = new Set<string>();
      const normalizeUrl = (url: string): string => {
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
      };
      
      for (const url of crawlResult.urls) {
        const normalized = normalizeUrl(url);
        if (!urlSet.has(normalized)) {
          urlSet.add(normalized);
          urls.push(url);
        } else {
          console.log(`   ⚠️  Skipping duplicate URL: ${url}`);
        }
      }
      
      // Final deduplication pass (double-check)
      const finalUrls: string[] = [];
      const finalSet = new Set<string>();
      for (const url of urls) {
        const normalized = normalizeUrl(url);
        if (!finalSet.has(normalized)) {
          finalSet.add(normalized);
          finalUrls.push(url);
        }
      }
      urls = finalUrls;

      if (urls.length === 0) {
        console.error("❌ No pages discovered during crawl. Exiting.");
        process.exit(1);
      }
      
      console.log(`\n✅ Found ${urls.length} unique page(s) to capture\n`);
      
      // If crawl mode captured screenshots, use them directly
      if (crawlResult.screenshots && crawlResult.screenshots.length > 0) {
        console.log(`📸 Screenshots captured during crawl: ${crawlResult.screenshots.length}\n`);
        // Use screenshots from crawl, skip separate capture phase
        const screenshots = crawlResult.screenshots;
        
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
            hasForm: screenshot.hasForm,
            beforeFormFilename: screenshot.beforeFormFilename,
            afterFormFilename: screenshot.afterFormFilename,
          });

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        console.log(`\n✅ Generated ${pages.length} description(s)\n`);

        // Step 3: Analyze codebase (if enabled)
        let codeDocs: CodeDocumentation[] = [];
        let comprehensiveAnalysis = undefined;
        
        if (codeAnalysisConfig.enabled && codeAnalysisConfig.codebasePath) {
          console.log("📚 Step 3: Analyzing codebase...\n");
          codeDocs = await analyzeCodebase(codeAnalysisConfig);
          comprehensiveAnalysis = await generateComprehensiveAnalysis(codeDocs);
        }

        // Step 4: Build markdown documentation
        const stepNumber = codeAnalysisConfig.enabled ? "4" : "3";
        console.log(`📝 Step ${stepNumber}: Building markdown documentation...\n`);
        await buildMarkdown(pages, defaultConfig, codeDocs, comprehensiveAnalysis);

        console.log("\n==================================================");
        console.log("✅ Walkthrough generation complete!");
        console.log("==================================================\n");
        console.log(`📄 Documentation: ${defaultConfig.outputFile}`);
        console.log(`🖼️  Screenshots: ${defaultConfig.imagesDir}`);
        console.log(`📊 Pages documented: ${pages.length}\n`);

        return; // Exit early since we've already processed everything
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
    codeAnalysis: codeAnalysisConfig.enabled ? codeAnalysisConfig : undefined,
  };

  try {
    let pages: PageData[] = [];
    let codeDocs: CodeDocumentation[] = [];
    let comprehensiveAnalysis = undefined;

    // Step 1: Capture screenshots (only if we have URLs)
    if (urls.length > 0) {
      console.log("📸 Step 1: Capturing screenshots...\n");
      const screenshots = await captureScreenshots(urls, config);

      if (screenshots.length === 0) {
        console.error("❌ No screenshots were captured. Exiting.");
        process.exit(1);
      }

      console.log(`\n✅ Captured ${screenshots.length} screenshot(s)\n`);

      // Step 2: Generate descriptions using GPT-4o Vision
      console.log("🤖 Step 2: Generating AI descriptions...\n");

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
          hasForm: screenshot.hasForm,
          beforeFormFilename: screenshot.beforeFormFilename,
          afterFormFilename: screenshot.afterFormFilename,
        });

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(`\n✅ Generated ${pages.length} description(s)\n`);
    }

    // Step 3 (or 1 if no URLs): Analyze codebase (if enabled)
    if (config.codeAnalysis?.enabled) {
      const stepNumber = urls.length > 0 ? "3" : "1";
      console.log(`📚 Step ${stepNumber}: Analyzing codebase...\n`);
      
      // Phase 1: Extract code information (fast, no AI)
      console.log("   Phase 1: Extracting code structure...\n");
      codeDocs = await analyzeCodebase(config.codeAnalysis);
      console.log(`   ✅ Extracted information from ${codeDocs.length} file(s)\n`);
      
      // Phase 2: Generate comprehensive analysis (AI-powered)
      if (codeDocs.length > 0) {
        console.log("   Phase 2: Generating comprehensive analysis...\n");
        comprehensiveAnalysis = await generateComprehensiveAnalysis(codeDocs);
        console.log("   ✅ Comprehensive analysis generated\n");
      }
    }

    // Final step: Build markdown documentation
    let stepNumber: string;
    if (urls.length > 0 && config.codeAnalysis?.enabled) {
      stepNumber = "4";
    } else if (urls.length > 0) {
      stepNumber = "3";
    } else {
      stepNumber = "2";
    }
    console.log(`📝 Step ${stepNumber}: Building markdown documentation...\n`);
    await buildMarkdown(pages, config, codeDocs, comprehensiveAnalysis);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ Walkthrough generation complete!");
    console.log("=".repeat(50));
    console.log(`📄 Documentation: ${config.outputFile}`);
    if (pages.length > 0) {
      console.log(`🖼️  Screenshots: ${config.imagesDir}/`);
      console.log(`📊 Pages documented: ${pages.length}`);
    }
    if (codeDocs.length > 0) {
      console.log(`📚 Code files analyzed: ${codeDocs.length}`);
    }
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

