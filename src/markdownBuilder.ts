/**
 * Markdown builder for walkthrough documentation
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { Config } from "./config.js";

export interface PageData {
  title: string;
  url: string;
  filename: string;
  description: string;
  timestamp: Date;
}

/**
 * Generate a Mermaid diagram for the sitemap
 */
function generateMermaidDiagram(pages: PageData[]): string {
  if (pages.length === 0) return "";

  let mermaid = "```mermaid\ngraph TD\n";
  
  // Create nodes for each page
  pages.forEach((page, index) => {
    const nodeId = `A${index}`;
    const label = page.title.length > 30 
      ? page.title.substring(0, 30) + "..." 
      : page.title;
    mermaid += `    ${nodeId}["${label}"]\n`;
  });

  // Connect pages in order (simple linear flow)
  for (let i = 0; i < pages.length - 1; i++) {
    mermaid += `    A${i} --> A${i + 1}\n`;
  }

  mermaid += "```\n\n";
  return mermaid;
}

/**
 * Build markdown documentation from page data
 */
export async function buildMarkdown(
  pages: PageData[],
  config: Config
): Promise<void> {
  if (pages.length === 0) {
    console.warn("⚠️  No pages to document. Skipping markdown generation.");
    return;
  }

  console.log(`📝 Building markdown documentation...`);

  // Ensure output directory exists
  const outputDir = path.dirname(config.outputFile) || ".";
  if (outputDir !== "." && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let content = "# 🧭 Visual Walkthrough\n\n";
  content += `*Generated on ${new Date().toLocaleString()}*\n\n`;
  content += `This document provides a visual walkthrough of the application with AI-generated descriptions.\n\n`;

  // Add table of contents
  content += "## 📑 Table of Contents\n\n";
  pages.forEach((page, index) => {
    const anchor = page.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    content += `${index + 1}. [${page.title}](#${anchor})\n`;
  });
  content += "\n---\n\n";

  // Add Mermaid diagram if we have multiple pages
  if (pages.length > 1) {
    content += "## 🗺️ Navigation Flow\n\n";
    content += generateMermaidDiagram(pages);
  }

  // Add each page section
  pages.forEach((page, index) => {
    const relativeImagePath = path.relative(
      path.dirname(config.outputFile) || ".",
      page.filename
    );

    content += `## ${page.title}\n\n`;
    content += `**URL:** [${page.url}](${page.url})\n\n`;
    content += `![${page.title}](${relativeImagePath})\n\n`;
    content += `> ${page.description}\n\n`;
    content += `*Screenshot captured: ${page.timestamp.toLocaleString()}*\n\n`;
    content += "---\n\n";
  });

  // Add footer
  content += `\n---\n\n`;
  content += `*This walkthrough was automatically generated using AI-powered visual analysis.*\n`;

  // Write to file
  writeFileSync(config.outputFile, content, "utf-8");
  console.log(`✅ Markdown documentation saved to: ${config.outputFile}`);
}

