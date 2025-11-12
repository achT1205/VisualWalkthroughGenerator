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

export interface ComprehensiveCodeAnalysis {
  overview: string;
  architecture: string;
  components: {
    name: string;
    file: string;
    description: string;
  }[];
  routes: {
    path: string;
    file: string;
    description: string;
  }[];
  apis: {
    endpoint: string;
    method?: string;
    file: string;
    description: string;
  }[];
  keyFiles: {
    path: string;
    type: string;
    importance: string;
  }[];
  patterns: string[];
  technologies: string[];
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
      // Extract code elements (fast, no AI)
      const elements = extractCodeElements(file.content, file.language);

      // Generate basic summary (no AI call - we'll do comprehensive analysis later)
      const summary = `A ${file.type} file written in ${file.language}.`;

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
 * Generate comprehensive codebase documentation from extracted data
 */
export async function generateComprehensiveAnalysis(
  codeDocs: CodeDocumentation[]
): Promise<ComprehensiveCodeAnalysis> {
  if (codeDocs.length === 0) {
    return {
      overview: "No code files analyzed.",
      architecture: "",
      components: [],
      routes: [],
      apis: [],
      keyFiles: [],
      patterns: [],
      technologies: [],
    };
  }

  console.log("📊 Generating comprehensive codebase analysis...\n");

  // Prepare structured data for GPT
  const structuredData = {
    totalFiles: codeDocs.length,
    components: codeDocs
      .filter((d) => d.components && d.components.length > 0)
      .flatMap((d) =>
        (d.components || []).map((c) => ({
          name: c,
          file: d.file.path,
          type: d.file.type,
        }))
      ),
    routes: codeDocs
      .filter((d) => d.routes && d.routes.length > 0)
      .flatMap((d) =>
        (d.routes || []).map((r) => ({
          path: r,
          file: d.file.path,
        }))
      ),
    apis: codeDocs
      .filter((d) => d.apis && d.apis.length > 0)
      .flatMap((d) =>
        (d.apis || []).map((a) => ({
          endpoint: a,
          file: d.file.path,
        }))
      ),
    fileSummaries: codeDocs
      .filter((d) => d.file.type === "component" || d.file.type === "route" || d.file.type === "api")
      .map((d) => ({
        path: d.file.path,
        type: d.file.type,
        summary: d.summary,
        language: d.file.language,
      })),
    technologies: [
      ...new Set(codeDocs.map((d) => d.file.language)),
    ],
  };

  const OpenAI = (await import("openai")).default;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    // Fallback to basic analysis
    return generateBasicAnalysis(codeDocs, structuredData);
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert software architect and technical documentation specialist. 
Analyze the provided codebase structure and generate comprehensive documentation that includes:
1. A high-level overview of what the application does
2. Architecture description (patterns, structure, organization)
3. Component descriptions with their purposes
4. Route descriptions
5. API endpoint documentation
6. Key files and their importance
7. Design patterns identified
8. Technologies used

Be comprehensive, clear, and focus on helping developers understand the codebase structure and purpose.`,
        },
        {
          role: "user",
          content: `Analyze this codebase:

**Total Files:** ${structuredData.totalFiles}
**Technologies:** ${structuredData.technologies.join(", ")}

**Components Found:**
${structuredData.components.map((c) => `- ${c.name} (${c.file})`).join("\n")}

**Routes Found:**
${structuredData.routes.map((r) => `- ${r.path} (${r.file})`).join("\n")}

**API Endpoints Found:**
${structuredData.apis.map((a) => `- ${a.endpoint} (${a.file})`).join("\n")}

**Key File Summaries:**
${structuredData.fileSummaries.map((f) => `- ${f.path} (${f.type}, ${f.language}): ${f.summary}`).join("\n")}

Generate a comprehensive analysis in JSON format with this structure:
{
  "overview": "High-level description of the application",
  "architecture": "Architecture description, patterns, and structure",
  "components": [{"name": "...", "file": "...", "description": "..."}],
  "routes": [{"path": "...", "file": "...", "description": "..."}],
  "apis": [{"endpoint": "...", "method": "...", "file": "...", "description": "..."}],
  "keyFiles": [{"path": "...", "type": "...", "importance": "..."}],
  "patterns": ["pattern1", "pattern2"],
  "technologies": ["tech1", "tech2"]
}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const analysis = JSON.parse(
      response.choices[0]?.message?.content || "{}"
    ) as ComprehensiveCodeAnalysis;

    // Ensure all arrays exist
    return {
      overview: analysis.overview || "No overview available.",
      architecture: analysis.architecture || "No architecture description available.",
      components: analysis.components || [],
      routes: analysis.routes || [],
      apis: analysis.apis || [],
      keyFiles: analysis.keyFiles || [],
      patterns: analysis.patterns || [],
      technologies: analysis.technologies || structuredData.technologies,
    };
  } catch (error) {
    console.log(`   ⚠️  Error generating comprehensive analysis, using basic analysis`);
    return generateBasicAnalysis(codeDocs, structuredData);
  }
}

/**
 * Generate basic analysis without AI (fallback)
 */
function generateBasicAnalysis(
  codeDocs: CodeDocumentation[],
  structuredData: any
): ComprehensiveCodeAnalysis {
  return {
    overview: `This codebase contains ${codeDocs.length} files written in ${structuredData.technologies.join(", ")}.`,
    architecture: `The codebase is organized with components, routes, and API endpoints.`,
    components: structuredData.components.map((c: any) => ({
      name: c.name,
      file: c.file,
      description: `Component defined in ${c.file}`,
    })),
    routes: structuredData.routes.map((r: any) => ({
      path: r.path,
      file: r.file,
      description: `Route defined in ${r.file}`,
    })),
    apis: structuredData.apis.map((a: any) => ({
      endpoint: a.endpoint,
      file: a.file,
      description: `API endpoint defined in ${a.file}`,
    })),
    keyFiles: structuredData.fileSummaries.slice(0, 10).map((f: any) => ({
      path: f.path,
      type: f.type,
      importance: "Key file in the application",
    })),
    patterns: [],
    technologies: structuredData.technologies,
  };
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

