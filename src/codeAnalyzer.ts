/**
 * Codebase analyzer for extracting documentation from source code
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import path from "path";
import { describeScreenshot } from "./openaiClient.js";

export interface CodeAnalysisOptions {
  codebasePath?: string;
  enabled: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  maxFileSize: number; // in bytes
}

export interface CodeFile {
  path: string;
  name: string;
  type: "component" | "route" | "api" | "util" | "config" | "other";
  content: string;
  language: string;
}

export interface CodeDocumentation {
  file: CodeFile;
  summary: string;
  components?: string[];
  functions?: string[];
  routes?: string[];
  apis?: string[];
  dependencies?: string[];
}

/**
 * Detect file type based on name and content
 */
function detectFileType(filePath: string, content: string): CodeFile["type"] {
  const name = path.basename(filePath).toLowerCase();
  
  // Route files
  if (name.includes("route") || name.includes("router") || 
      filePath.includes("/routes/") || filePath.includes("/pages/")) {
    return "route";
  }
  
  // API files
  if (name.includes("api") || name.includes("endpoint") || 
      filePath.includes("/api/") || filePath.includes("/endpoints/")) {
    return "api";
  }
  
  // Component files (React, Vue, etc.)
  if (name.includes("component") || name.includes("view") || 
      filePath.includes("/components/") || filePath.includes("/views/") ||
      /export\s+(default\s+)?(function|const|class)\s+\w+/.test(content)) {
    return "component";
  }
  
  // Config files
  if (name.includes("config") || name.includes("settings") ||
      filePath.includes("/config/")) {
    return "config";
  }
  
  // Utility files
  if (name.includes("util") || name.includes("helper") ||
      filePath.includes("/utils/") || filePath.includes("/helpers/")) {
    return "util";
  }
  
  return "other";
}

/**
 * Get file language from extension
 */
function getFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript React",
    ".js": "JavaScript",
    ".jsx": "JavaScript React",
    ".vue": "Vue",
    ".py": "Python",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".php": "PHP",
  };
  return langMap[ext] || ext.substring(1).toUpperCase();
}

/**
 * Extract components/functions from code
 */
function extractCodeElements(content: string, language: string): {
  components: string[];
  functions: string[];
  routes: string[];
  apis: string[];
} {
  const components: string[] = [];
  const functions: string[] = [];
  const routes: string[] = [];
  const apis: string[] = [];

  // Extract React/Vue components
  const componentRegex = /(?:export\s+(?:default\s+)?(?:function|const|class)\s+)([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = componentRegex.exec(content)) !== null) {
    components.push(match[1]);
  }

  // Extract functions
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Extract routes (common patterns)
  const routeRegex = /(?:route|path|url)[\s:=]+['"`]([^'"`]+)['"`]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.push(match[1]);
  }

  // Extract API endpoints
  const apiRegex = /(?:app\.|router\.)(?:get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/gi;
  while ((match = apiRegex.exec(content)) !== null) {
    apis.push(match[1]);
  }

  return { components, functions, routes, apis };
}

/**
 * Check if file should be included
 */
function shouldIncludeFile(
  filePath: string,
  options: CodeAnalysisOptions
): boolean {
  // Check exclude patterns
  for (const pattern of options.excludePatterns) {
    if (filePath.includes(pattern)) {
      return false;
    }
  }

  // Check include patterns (if any specified)
  if (options.includePatterns.length > 0) {
    const matches = options.includePatterns.some((pattern) =>
      filePath.includes(pattern)
    );
    if (!matches) {
      return false;
    }
  }

  return true;
}

/**
 * Recursively find code files
 */
function findCodeFiles(
  dir: string,
  options: CodeAnalysisOptions,
  fileList: CodeFile[] = []
): CodeFile[] {
  if (!existsSync(dir)) {
    return fileList;
  }

  try {
    const files = readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      
      // Skip node_modules, .git, etc.
      if (file.startsWith(".") || file === "node_modules" || file === "dist" || file === "build") {
        continue;
      }

      try {
        const stat = statSync(filePath);

        if (stat.isDirectory()) {
          findCodeFiles(filePath, options, fileList);
        } else if (stat.isFile()) {
          // Check file size
          if (stat.size > options.maxFileSize) {
            continue;
          }

          // Check if should be included
          if (!shouldIncludeFile(filePath, options)) {
            continue;
          }

          // Read file content
          try {
            const content = readFileSync(filePath, "utf-8");
            const fileType = detectFileType(filePath, content);
            const language = getFileLanguage(filePath);

            fileList.push({
              path: filePath,
              name: file,
              type: fileType,
              content,
              language,
            });
          } catch (readError) {
            // Skip files that can't be read (binary, etc.)
            continue;
          }
        }
      } catch (statError) {
        // Skip files we can't stat
        continue;
      }
    }
  } catch (error) {
    console.error(`⚠️  Error reading directory ${dir}:`, error);
  }

  return fileList;
}

/**
 * Analyze codebase and generate documentation
 */
export async function analyzeCodebase(
  options: CodeAnalysisOptions
): Promise<CodeDocumentation[]> {
  if (!options.enabled || !options.codebasePath) {
    return [];
  }

  console.log(`📚 Analyzing codebase: ${options.codebasePath}\n`);

  // Find all code files
  const codeFiles = findCodeFiles(options.codebasePath, options);

  if (codeFiles.length === 0) {
    console.log("⚠️  No code files found to analyze.");
    return [];
  }

  console.log(`   Found ${codeFiles.length} code file(s) to analyze\n`);

  const documentation: CodeDocumentation[] = [];

  // Analyze each file
  for (let i = 0; i < codeFiles.length; i++) {
    const file = codeFiles[i];
    console.log(`   [${i + 1}/${codeFiles.length}] Analyzing: ${file.path}`);

    try {
      // Extract code elements
      const elements = extractCodeElements(file.content, file.language);

      // Generate summary using GPT (for important files)
      let summary = "";
      if (file.type === "component" || file.type === "route" || file.type === "api") {
        // Truncate content if too long (GPT has token limits)
        const contentPreview = file.content.substring(0, 4000);
        
        try {
          summary = await generateCodeSummary(
            file.name,
            file.language,
            contentPreview,
            file.type
          );
        } catch (error) {
          console.log(`      ⚠️  Could not generate AI summary, using basic summary`);
          summary = `A ${file.type} file written in ${file.language}.`;
        }
      } else {
        summary = `A ${file.type} file written in ${file.language}.`;
      }

      documentation.push({
        file,
        summary,
        components: elements.components.length > 0 ? elements.components : undefined,
        functions: elements.functions.length > 0 ? elements.functions : undefined,
        routes: elements.routes.length > 0 ? elements.routes : undefined,
        apis: elements.apis.length > 0 ? elements.apis : undefined,
      });

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.log(`      ⚠️  Error analyzing file: ${error}`);
    }
  }

  console.log(`\n✅ Analyzed ${documentation.length} file(s)\n`);

  return documentation;
}

/**
 * Generate code summary using GPT
 */
async function generateCodeSummary(
  fileName: string,
  language: string,
  codeContent: string,
  fileType: CodeFile["type"]
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  
  // We'll use a simple approach - call OpenAI directly
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `A ${fileType} file written in ${language}.`;
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a code documentation assistant. Generate a concise 2-3 sentence summary of what this code file does. Focus on its purpose and main functionality.`,
      },
      {
        role: "user",
        content: `File: ${fileName}\nType: ${fileType}\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\nProvide a brief summary of what this file does.`,
      },
    ],
    max_tokens: 150,
  });

  return response.choices[0]?.message?.content || `A ${fileType} file written in ${language}.`;
}

