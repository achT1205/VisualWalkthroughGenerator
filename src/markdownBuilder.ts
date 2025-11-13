/**
 * Markdown builder for walkthrough documentation
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { Config } from "./config.js";
import {
  CodeDocumentation,
  ComprehensiveCodeAnalysis,
} from "./codeAnalyzer.js";

export interface PageData {
  title: string;
  url: string;
  filename: string;
  description: string;
  timestamp: Date;
  hasForm?: boolean;
  beforeFormFilename?: string;
  afterFormFilename?: string;
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
 * Build comprehensive code documentation section
 */
function buildComprehensiveCodeSection(
  analysis: ComprehensiveCodeAnalysis
): string {
  let content = "## 📚 Codebase Documentation\n\n";
  content += `This section provides comprehensive documentation of the application's source code, architecture, and structure.\n\n`;

  // Overview
  content += "### 📖 Overview\n\n";
  content += `${analysis.overview}\n\n`;

  // Architecture
  if (analysis.architecture) {
    content += "### 🏗️ Architecture\n\n";
    content += `${analysis.architecture}\n\n`;
  }

  // Features
  if (analysis.features && analysis.features.length > 0) {
    content += "### ✨ Main Features\n\n";
    analysis.features.forEach((feature) => {
      content += `- ${feature}\n`;
    });
    content += "\n";
  }

  // Technologies
  if (analysis.technologies.length > 0) {
    content += "### 🛠️ Technologies\n\n";
    analysis.technologies.forEach((tech) => {
      content += `- ${tech}\n`;
    });
    content += "\n";
  }

  // Patterns
  if (analysis.patterns.length > 0) {
    content += "### 🎨 Design Patterns\n\n";
    analysis.patterns.forEach((pattern) => {
      content += `- ${pattern}\n`;
    });
    content += "\n";
  }

  // Components
  if (analysis.components.length > 0) {
    content += "### 🧩 Components & Views\n\n";
    analysis.components.forEach((comp) => {
      content += `#### \`${comp.name}\`\n\n`;
      content += `**File:** \`${comp.file}\`\n\n`;
      content += `**Description:** ${comp.description}\n\n`;
      content += "---\n\n";
    });
  }

  // Routes
  if (analysis.routes.length > 0) {
    content += "### 🛣️ Routes & Navigation\n\n";
    analysis.routes.forEach((route) => {
      content += `#### \`${route.path}\`\n\n`;
      content += `**File:** \`${route.file}\`\n\n`;
      content += `**Description:** ${route.description}\n\n`;
      content += "---\n\n";
    });
  }

  // APIs
  if (analysis.apis.length > 0) {
    content += "### 🔌 API Endpoints\n\n";
    analysis.apis.forEach((api) => {
      content += `#### \`${api.endpoint}\`\n\n`;
      if (api.method) {
        content += `**Method:** ${api.method}\n\n`;
      }
      content += `**File:** \`${api.file}\`\n\n`;
      content += `**Description:** ${api.description}\n\n`;
      content += "---\n\n";
    });
  }

  // Key Files
  if (analysis.keyFiles.length > 0) {
    content += "### 📄 Key Files & Structure\n\n";
    analysis.keyFiles.forEach((file) => {
      content += `#### \`${file.path}\`\n\n`;
      content += `**Type:** ${file.type}\n\n`;
      content += `**Importance:** ${file.importance}\n\n`;
      content += "---\n\n";
    });
  }

  return content;
}

/**
 * Build code documentation section (legacy - file-by-file)
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
  codeDocs?: CodeDocumentation[],
  comprehensiveAnalysis?: ComprehensiveCodeAnalysis
): Promise<void> {
  // Check if we have anything to document
  const hasPages = pages.length > 0;
  const hasCodeDocs = (comprehensiveAnalysis !== undefined) || (codeDocs && codeDocs.length > 0);
  
  if (!hasPages && !hasCodeDocs) {
    console.warn("⚠️  No pages or code documentation to document. Skipping markdown generation.");
    return;
  }

  console.log(`📝 Building markdown documentation...`);

  // Ensure output directory exists
  const outputDir = path.dirname(config.outputFile) || ".";
  if (outputDir !== "." && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Determine document title based on content
  let title = "# 🧭 Visual Walkthrough\n\n";
  if (!hasPages && hasCodeDocs) {
    title = "# 📚 Codebase Documentation\n\n";
  } else if (hasPages && hasCodeDocs) {
    title = "# 🧭 Visual Walkthrough & Codebase Documentation\n\n";
  }

  let content = title;
  content += `*Generated on ${new Date().toLocaleString()}*\n\n`;
  
  if (hasPages && hasCodeDocs) {
    content += `This document provides a visual walkthrough of the application with AI-generated descriptions and comprehensive codebase analysis.\n\n`;
  } else if (hasPages) {
    content += `This document provides a visual walkthrough of the application with AI-generated descriptions.\n\n`;
  } else if (hasCodeDocs) {
    content += `This document provides comprehensive codebase analysis and documentation.\n\n`;
  }

  // Add table of contents (only if we have pages)
  if (hasPages) {
    content += "## 📑 Table of Contents\n\n";
    pages.forEach((page, index) => {
      const anchor = page.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      content += `${index + 1}. [${page.title}](#${anchor})\n`;
    });
    
    // Add code documentation section to TOC if available
    if (hasCodeDocs) {
      const tocOffset = pages.length;
      if (comprehensiveAnalysis) {
        content += `${tocOffset + 1}. [Codebase Analysis](#codebase-analysis)\n`;
      } else if (codeDocs && codeDocs.length > 0) {
        content += `${tocOffset + 1}. [Code Documentation](#code-documentation)\n`;
      }
    }
    content += "\n---\n\n";

    // Add Mermaid diagram if we have multiple pages
    if (pages.length > 1) {
      content += "## 🗺️ Navigation Flow\n\n";
      content += generateMermaidDiagram(pages);
      content += "\n---\n\n";
    }
  } else {
    // Codebase-only mode: Add TOC for code sections
    content += "## 📑 Table of Contents\n\n";
    if (comprehensiveAnalysis) {
      content += `1. [Codebase Analysis](#codebase-analysis)\n`;
    } else if (codeDocs && codeDocs.length > 0) {
      content += `1. [Code Documentation](#code-documentation)\n`;
    }
    content += "\n---\n\n";
  }

  // Add code documentation if available (before pages in codebase-only mode, after TOC in mixed mode)
  if (comprehensiveAnalysis) {
    content += "\n";
    content += buildComprehensiveCodeSection(comprehensiveAnalysis);
    content += "\n---\n\n";
  } else if (codeDocs && codeDocs.length > 0) {
    content += "\n";
    content += buildCodeDocumentationSection(codeDocs);
    content += "\n---\n\n";
  }

  // Add each page section (only if we have pages)
  if (hasPages) {
    pages.forEach((page, index) => {
    const relativeImagePath = path.relative(
      path.dirname(config.outputFile) || ".",
      page.filename
    );

    content += `## ${page.title}\n\n`;
    content += `**URL:** [${page.url}](${page.url})\n\n`;
    
    // If page has form, show before and after screenshots
    if (page.hasForm && page.beforeFormFilename && page.afterFormFilename) {
      const beforePath = path.relative(
        path.dirname(config.outputFile) || ".",
        page.beforeFormFilename
      );
      const afterPath = path.relative(
        path.dirname(config.outputFile) || ".",
        page.afterFormFilename
      );
      
      content += `### Before Form Submission\n\n`;
      content += `![${page.title} - Before](${beforePath})\n\n`;
      content += `### After Form Submission\n\n`;
      content += `![${page.title} - After](${afterPath})\n\n`;
    } else {
      content += `![${page.title}](${relativeImagePath})\n\n`;
    }
    
    content += `> ${page.description}\n\n`;
    content += `*Screenshot captured: ${page.timestamp.toLocaleString()}*\n\n`;
    content += "---\n\n";
    });
  }

  // Add footer
  content += `\n---\n\n`;
  if (hasPages && hasCodeDocs) {
    content += `*This documentation was automatically generated using AI-powered visual analysis and codebase analysis.*\n`;
  } else if (hasPages) {
    content += `*This walkthrough was automatically generated using AI-powered visual analysis.*\n`;
  } else if (hasCodeDocs) {
    content += `*This codebase documentation was automatically generated using AI-powered code analysis.*\n`;
  }

  // Write to file
  writeFileSync(config.outputFile, content, "utf-8");
  console.log(`✅ Markdown documentation saved to: ${config.outputFile}`);
}

