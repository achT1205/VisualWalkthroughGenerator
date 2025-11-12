/**
 * Website crawler to automatically discover all pages
 */

import { Page } from "playwright";
import { URL } from "url";
import { detectForms, autoFillForm, type FormField } from "./formHandler.js";

export interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  includePatterns: string[];
  routesFromCode?: string[]; // Routes extracted from codebase analysis
  autoFillForms?: boolean; // Automatically fill and submit forms
  formFields?: Array<{ selector: string; value: string }>; // Custom form field values
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
 * Extract all links from a page (including SPA routes)
 */
async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const links = await page.evaluate((base) => {
      const urls: string[] = [];
      const baseUrlObj = new URL(base);

      // 1. Traditional anchor tags
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      for (const anchor of anchors) {
        const href = (anchor as HTMLAnchorElement).href;
        if (href && href.trim()) {
          urls.push(href);
        }
      }

      // 2. React Router Links (often have 'to' attribute or data attributes)
      const reactLinks = Array.from(document.querySelectorAll("[to], [href], button[onclick]"));
      for (const element of reactLinks) {
        const to = (element as HTMLElement).getAttribute('to');
        const href = (element as HTMLElement).getAttribute('href');
        const onClick = (element as HTMLElement).getAttribute('onclick');
        
        if (to && to.trim()) {
          // Convert relative path to absolute
          const absoluteUrl = to.startsWith('/') 
            ? `${baseUrlObj.origin}${to}`
            : new URL(to, base).toString();
          urls.push(absoluteUrl);
        }
        if (href && href.trim() && !href.startsWith('#')) {
          urls.push(href);
        }
        // Try to extract URLs from onclick handlers
        if (onClick) {
          const urlMatch = onClick.match(/['"`]([\/][^'"`]+)['"`]/);
          if (urlMatch) {
            urls.push(`${baseUrlObj.origin}${urlMatch[1]}`);
          }
        }
      }

      // 3. Data attributes (for SPAs)
      const spaLinks = Array.from(document.querySelectorAll("[data-href], [data-link], [data-url], [data-to], [data-route]"));
      for (const element of spaLinks) {
        const href = (element as HTMLElement).getAttribute('data-href') || 
                     (element as HTMLElement).getAttribute('data-link') ||
                     (element as HTMLElement).getAttribute('data-url') ||
                     (element as HTMLElement).getAttribute('data-to') ||
                     (element as HTMLElement).getAttribute('data-route');
        if (href && href.trim()) {
          const absoluteUrl = href.startsWith('/') 
            ? `${baseUrlObj.origin}${href}`
            : new URL(href, base).toString();
          urls.push(absoluteUrl);
        }
      }

      // 4. Navigation elements (nav, menu, etc.)
      const navElements = Array.from(document.querySelectorAll("nav a, menu a, [role='navigation'] a, [role='menuitem']"));
      for (const nav of navElements) {
        const href = (nav as HTMLAnchorElement).href || (nav as HTMLElement).getAttribute('href');
        if (href && href.trim() && !href.startsWith('#')) {
          urls.push(href);
        }
      }

      // 5. Try to find router configuration in window object (for React Router, Vue Router, etc.)
      try {
        // React Router
        if ((window as any).__REACT_ROUTER__ || (window as any).ReactRouter) {
          const routes = (window as any).__REACT_ROUTER__?.routes || [];
          routes.forEach((route: any) => {
            if (route.path) {
              urls.push(`${baseUrlObj.origin}${route.path}`);
            }
          });
        }
        // Vue Router
        if ((window as any).__VUE_ROUTER__) {
          const routes = (window as any).__VUE_ROUTER__.options?.routes || [];
          routes.forEach((route: any) => {
            if (route.path) {
              urls.push(`${baseUrlObj.origin}${route.path}`);
            }
          });
        }
      } catch (e) {
        // Ignore errors accessing window objects
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

  // Add routes from codebase if available (for SPAs)
  if (options.routesFromCode && options.routesFromCode.length > 0) {
    console.log(`   Found ${options.routesFromCode.length} route(s) from codebase analysis\n`);
    const baseUrlObj = new URL(startUrl);
    const addedRoutes = new Set<string>(); // Track routes we've added to avoid duplicates
    
    for (const route of options.routesFromCode) {
      const routeUrl = route.startsWith('/')
        ? `${baseUrlObj.origin}${route}`
        : new URL(route, startUrl).toString();
      const normalizedRoute = normalizeUrl(routeUrl);
      
      // Only add if not already in queue and same domain
      if (!addedRoutes.has(normalizedRoute) && isSameDomain(normalizedRoute, startUrl)) {
        toVisit.push({ url: normalizedRoute, depth: 0 });
        addedRoutes.add(normalizedRoute); // Track to avoid adding duplicates to queue
        console.log(`   Added route to queue: ${normalizedRoute}`);
      }
    }
    console.log(`   Added ${addedRoutes.size} route(s) to crawl queue\n`);
  }

  while (toVisit.length > 0 && discovered.length < options.maxPages) {
    const { url, depth } = toVisit.shift()!;
    const normalizedUrl = normalizeUrl(url);

    // Skip if already visited (check normalized URL)
    if (visited.has(normalizedUrl)) {
      console.log(`   [Depth ${depth}] Skipping already visited: ${url}`);
      continue;
    }

    // Skip if depth exceeded
    if (depth > options.maxDepth) {
      console.log(`   [Depth ${depth}] Skipping (max depth): ${url}`);
      continue;
    }

    // Skip if not same domain (if required)
    if (options.sameDomainOnly && !isSameDomain(normalizedUrl, startUrl)) {
      console.log(`   [Depth ${depth}] Skipping (different domain): ${url}`);
      continue;
    }

    // Skip if excluded by patterns
    if (!shouldIncludeUrl(normalizedUrl, options)) {
      console.log(`   [Depth ${depth}] Skipping (excluded pattern): ${url}`);
      continue;
    }

    // Mark as visited (use normalized URL)
    visited.add(normalizedUrl);
    discovered.push(normalizedUrl);

    console.log(`   [Depth ${depth}] Processing: ${normalizedUrl}`);

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

      // Wait for SPA to fully load - try networkidle for SPAs
      try {
        await page.waitForLoadState("networkidle", { timeout: 5000 });
      } catch {
        // Fallback to timeout if networkidle doesn't work
        await page.waitForTimeout(3000);
      }

      // Try to wait for navigation/links to be ready (multiple selectors for SPAs)
      try {
        await Promise.race([
          page.waitForSelector("a[href]", { timeout: 5000 }),
          page.waitForSelector("[to]", { timeout: 5000 }),
          page.waitForSelector("nav", { timeout: 5000 }),
          page.waitForSelector("[role='navigation']", { timeout: 5000 }),
        ]);
      } catch {
        // Continue even if no links found
      }
      
      // Additional wait for dynamic content
      await page.waitForTimeout(1000);

      // Check if page has forms that need interaction (if auto-fill is enabled)
      if (options.autoFillForms !== false) {
        const hasForms = await detectForms(page);
        if (hasForms) {
          console.log("   📋 Form detected, attempting to fill and submit...");
          
          // Convert formFields config to FormField format if provided
          const customFields = options.formFields?.map(f => ({
            selector: f.selector,
            value: f.value,
          }));
          
          const formFilled = await autoFillForm(page, customFields);
          if (formFilled) {
            // Wait a bit more after form submission
            await page.waitForTimeout(2000);
            // Re-extract links after form submission (new page might have loaded)
            const linksAfterForm = await extractLinks(page, url);
            if (linksAfterForm.length > 0) {
              console.log(`   Found ${linksAfterForm.length} additional link(s) after form submission`);
            }
          }
        }
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

  // Final deduplication before returning (in case of any duplicates)
  const uniqueUrls = Array.from(new Set(discovered.map(u => normalizeUrl(u))));
  
  console.log(`\n✅ Crawl complete:`);
  console.log(`   Discovered: ${uniqueUrls.length} unique page(s)`);
  console.log(`   Skipped: ${skipped} page(s)\n`);

  return {
    urls: uniqueUrls,
    discovered: uniqueUrls.length,
    skipped,
  };
}

