/**
 * Markdown builder for walkthrough documentation
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { Config } from "./config.js";
import { CodeDocumentation } from "./codeAnalyzer.js";

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
 * Build code documentation section
 */
function buildCodeDocumentationSection(
  codeDocs: CodeDocumentation[]
): string {
  if (codeDocs.length === 0) return "";

  let content = "## 📚 Codebase Documentation\n\n";
  content += `This section provides documentation extracted from the application's source code.\n\n`;

  // Group by type
  const byType = {
    component: codeDocs.filter((d) => d.file.type === "component"),
    route: codeDocs.filter((d) => d.file.type === "route"),
    api: codeDocs.filter((d) => d.file.type === "api"),
    config: codeDocs.filter((d) => d.file.type === "config"),
    util: codeDocs.filter((d) => d.file.type === "util"),
    other: codeDocs.filter((d) => d.file.type === "other"),
  };

  // Components section
  if (byType.component.length > 0) {
    content += "### 🧩 Components\n\n";
    byType.component.forEach((doc) => {
      content += `#### \`${doc.file.name}\`\n\n`;
      content += `**Path:** \`${doc.file.path}\`\n\n`;
      content += `**Language:** ${doc.file.language}\n\n`;
      content += `**Summary:** ${doc.summary}\n\n`;
      if (doc.components && doc.components.length > 0) {
        content += `**Exported Components:** ${doc.components.join(", ")}\n\n`;
      }
      if (doc.functions && doc.functions.length > 0) {
        content += `**Functions:** ${doc.functions.slice(0, 5).join(", ")}${doc.functions.length > 5 ? "..." : ""}\n\n`;
      }
      content += "---\n\n";
    });
  }

  // Routes section
  if (byType.route.length > 0) {
    content += "### 🛣️ Routes\n\n";
    byType.route.forEach((doc) => {
      content += `#### \`${doc.file.name}\`\n\n`;
      content += `**Path:** \`${doc.file.path}\`\n\n`;
      content += `**Summary:** ${doc.summary}\n\n`;
      if (doc.routes && doc.routes.length > 0) {
        content += `**Routes:**\n`;
        doc.routes.forEach((route) => {
          content += `- \`${route}\`\n`;
        });
        content += "\n";
      }
      content += "---\n\n";
    });
  }

  // API section
  if (byType.api.length > 0) {
    content += "### 🔌 API Endpoints\n\n";
    byType.api.forEach((doc) => {
      content += `#### \`${doc.file.name}\`\n\n`;
      content += `**Path:** \`${doc.file.path}\`\n\n`;
      content += `**Summary:** ${doc.summary}\n\n`;
      if (doc.apis && doc.apis.length > 0) {
        content += `**Endpoints:**\n`;
        doc.apis.forEach((api) => {
          content += `- \`${api}\`\n`;
        });
        content += "\n";
      }
      content += "---\n\n";
    });
  }

  // Other files
  const otherFiles = [
    ...byType.config,
    ...byType.util,
    ...byType.other,
  ];
  if (otherFiles.length > 0) {
    content += "### 📄 Other Files\n\n";
    otherFiles.slice(0, 10).forEach((doc) => {
      content += `- **\`${doc.file.name}\`** (${doc.file.language}): ${doc.summary}\n`;
    });
    if (otherFiles.length > 10) {
      content += `\n*... and ${otherFiles.length - 10} more files*\n`;
    }
    content += "\n";
  }

  return content;
}

/**
 * Build markdown documentation from page data
 */
export async function buildMarkdown(
  pages: PageData[],
  config: Config,
  codeDocs?: CodeDocumentation[]
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

  // Add code documentation if available
  if (codeDocs && codeDocs.length > 0) {
    content += "\n";
    content += buildCodeDocumentationSection(codeDocs);
    content += "\n---\n\n";
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

