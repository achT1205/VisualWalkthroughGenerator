/**
 * Configuration for the Visual Walkthrough Generator
 */

export interface CrawlConfig {
  enabled: boolean;
  maxDepth: number;
  maxPages: number;
  sameDomainOnly: boolean;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface Config {
  urls: string[];
  crawl?: CrawlConfig;
  outputDir: string;
  imagesDir: string;
  outputFile: string;
  screenshotOptions: {
    fullPage: boolean;
    waitForSelector?: string;
    timeout?: number;
  };
}

// Default URLs - can be overridden via CLI or environment
export const defaultUrls: string[] = [
  "https://example.com",
];

// Default configuration
export const defaultConfig: Config = {
  urls: defaultUrls,
  outputDir: "./",
  imagesDir: "./images",
  outputFile: "WALKTHROUGH.md",
  screenshotOptions: {
    fullPage: true,
    timeout: 60000, // 60 seconds (increased for slow-loading pages)
  },
};

/**
 * Get URLs from command line arguments or use defaults
 */
export function getUrlsFromArgs(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args.filter((arg) => arg.startsWith("http"));
  }
  return defaultUrls;
}

/**
 * Check if crawl mode is enabled via CLI flags
 */
export function isCrawlModeEnabled(): boolean {
  const args = process.argv.slice(2);
  return args.includes("--crawl") || args.includes("-c");
}

/**
 * Get crawl configuration from CLI or defaults
 */
export function getCrawlConfig(): CrawlConfig {
  const args = process.argv.slice(2);
  
  // Parse --max-depth
  const maxDepthIndex = args.indexOf("--max-depth");
  const maxDepth = maxDepthIndex !== -1 && args[maxDepthIndex + 1]
    ? parseInt(args[maxDepthIndex + 1], 10)
    : 3;

  // Parse --max-pages
  const maxPagesIndex = args.indexOf("--max-pages");
  const maxPages = maxPagesIndex !== -1 && args[maxPagesIndex + 1]
    ? parseInt(args[maxPagesIndex + 1], 10)
    : 50;

  // Parse --exclude patterns
  const excludeIndex = args.indexOf("--exclude");
  const excludePatterns = excludeIndex !== -1 && args[excludeIndex + 1]
    ? args[excludeIndex + 1].split(",").map((p) => p.trim())
    : ["#", "mailto:", "tel:", "javascript:", ".pdf", ".jpg", ".png", ".zip"];

  // Parse --include patterns
  const includeIndex = args.indexOf("--include");
  const includePatterns = includeIndex !== -1 && args[includeIndex + 1]
    ? args[includeIndex + 1].split(",").map((p) => p.trim())
    : [];

  return {
    enabled: isCrawlModeEnabled(),
    maxDepth,
    maxPages,
    sameDomainOnly: true, // Always crawl same domain only for safety
    excludePatterns,
    includePatterns,
  };
}

