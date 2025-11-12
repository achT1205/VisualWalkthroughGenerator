/**
 * Website crawler to automatically discover all pages
 */

import { Page } from "playwright";
import { URL } from "url";

export interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface CrawlResult {
  urls: string[];
  discovered: number;
  skipped: number;
}

/**
 * Normalize URL to avoid duplicates (remove trailing slashes, fragments, etc.)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove hash/fragment
    parsed.hash = "";
    // Remove trailing slash from pathname (except root)
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Check if URL should be included based on patterns
 */
function shouldIncludeUrl(url: string, options: CrawlOptions): boolean {
  // Check exclude patterns
  for (const pattern of options.excludePatterns) {
    if (url.includes(pattern)) {
      return false;
    }
  }

  // Check include patterns (if any specified)
  if (options.includePatterns.length > 0) {
    const matches = options.includePatterns.some((pattern) =>
      url.includes(pattern)
    );
    if (!matches) {
      return false;
    }
  }

  return true;
}

/**
 * Check if URL is on the same domain
 */
function isSameDomain(url1: string, url2: string): boolean {
  try {
    const domain1 = new URL(url1).hostname;
    const domain2 = new URL(url2).hostname;
    return domain1 === domain2;
  } catch {
    return false;
  }
}

/**
 * Extract all links from a page
 */
async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const links = await page.evaluate((base) => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const urls: string[] = [];

      for (const anchor of anchors) {
        const href = (anchor as HTMLAnchorElement).href;
        if (href && href.trim()) {
          urls.push(href);
        }
      }

      // Also try to find links in data attributes (for SPAs)
      const spaLinks = Array.from(document.querySelectorAll("[data-href], [data-link], [data-url]"));
      for (const element of spaLinks) {
        const href = (element as HTMLElement).getAttribute('data-href') || 
                     (element as HTMLElement).getAttribute('data-link') ||
                     (element as HTMLElement).getAttribute('data-url');
        if (href && href.trim()) {
          urls.push(href);
        }
      }

      return urls;
    }, baseUrl);

    // Normalize and filter links
    const normalizedLinks: string[] = [];
    const baseUrlObj = new URL(baseUrl);

    for (const link of links) {
      try {
        let absoluteUrl: string;
        if (link.startsWith("http://") || link.startsWith("https://")) {
          absoluteUrl = link;
        } else if (link.startsWith("//")) {
          absoluteUrl = `${baseUrlObj.protocol}${link}`;
        } else if (link.startsWith("/")) {
          absoluteUrl = `${baseUrlObj.origin}${link}`;
        } else {
          absoluteUrl = new URL(link, baseUrl).toString();
        }

        // Normalize the URL
        const normalized = normalizeUrl(absoluteUrl);
        normalizedLinks.push(normalized);
      } catch {
        // Skip invalid URLs
        continue;
      }
    }

    return [...new Set(normalizedLinks)]; // Remove duplicates
  } catch (error) {
    console.error(`   ⚠️  Error extracting links: ${error}`);
    return [];
  }
}

/**
 * Crawl a website starting from a base URL
 */
export async function crawlWebsite(
  page: Page,
  startUrl: string,
  options: CrawlOptions
): Promise<CrawlResult> {
  const visited = new Set<string>();
  const toVisit: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(startUrl), depth: 0 },
  ];
  const discovered: string[] = [];

  console.log(`🕷️  Starting crawl from: ${startUrl}`);
  console.log(`   Max depth: ${options.maxDepth}, Max pages: ${options.maxPages}\n`);

  while (toVisit.length > 0 && discovered.length < options.maxPages) {
    const { url, depth } = toVisit.shift()!;

    // Skip if already visited
    if (visited.has(url)) {
      continue;
    }

    // Skip if depth exceeded
    if (depth > options.maxDepth) {
      continue;
    }

    // Skip if not same domain (if required)
    if (options.sameDomainOnly && !isSameDomain(url, startUrl)) {
      continue;
    }

    // Skip if excluded by patterns
    if (!shouldIncludeUrl(url, options)) {
      continue;
    }

    // Mark as visited
    visited.add(url);
    discovered.push(url);

    console.log(`   [Depth ${depth}] Found: ${url}`);

    // If we've reached max pages, stop discovering new ones
    if (discovered.length >= options.maxPages) {
      console.log(`   ⚠️  Reached max pages limit (${options.maxPages})`);
      break;
    }

    // If at max depth, don't extract links
    if (depth >= options.maxDepth) {
      continue;
    }

    // Navigate and extract links
    try {
      const timeout = 30000; // 30s timeout for crawling
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout,
        });
      } catch (navError) {
        // Try with load strategy if domcontentloaded fails
        try {
          await page.goto(url, {
            waitUntil: "load",
            timeout: timeout,
          });
        } catch {
          // Skip this page if navigation fails
          console.log(`   ⚠️  Could not navigate to ${url}, skipping link extraction`);
          continue;
        }
      }

      // Wait a bit for dynamic content to load (especially for SPAs)
      await page.waitForTimeout(2000);

      // Try to wait for navigation/links to be ready
      try {
        await page.waitForSelector("a[href]", { timeout: 5000 });
      } catch {
        // Continue even if no links found
      }

      // Extract links
      const links = await extractLinks(page, url);
      
      console.log(`   Found ${links.length} link(s) on this page`);
      
      // Filter and add new links to queue
      let addedCount = 0;
      let skippedCount = 0;
      
      for (const link of links) {
        if (visited.has(link)) {
          skippedCount++;
          continue;
        }
        
        // Check if same domain (if required)
        if (options.sameDomainOnly && !isSameDomain(link, startUrl)) {
          skippedCount++;
          continue;
        }
        
        // Check if should be included
        if (!shouldIncludeUrl(link, options)) {
          skippedCount++;
          continue;
        }
        
        toVisit.push({ url: link, depth: depth + 1 });
        addedCount++;
      }
      
      if (addedCount > 0) {
        console.log(`   Added ${addedCount} new link(s) to queue (${skippedCount} skipped)`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error processing ${url}: ${error}`);
      // Continue with next URL
    }
  }

  const skipped = visited.size - discovered.length;

  console.log(`\n✅ Crawl complete:`);
  console.log(`   Discovered: ${discovered.length} page(s)`);
  console.log(`   Skipped: ${skipped} page(s)\n`);

  return {
    urls: discovered,
    discovered: discovered.length,
    skipped,
  };
}

