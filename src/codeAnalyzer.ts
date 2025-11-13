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
  features?: string[]; // Main features of the application
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
  // Vue Router: { path: '/route' }
  // React Router: path: '/route'
  // General: path: '/route', route: '/route', url: '/route'
  const routeRegex = /(?:path|route|url)[\s:=]+['"`]([^'"`]+)['"`]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    const route = match[1].trim();
    // Only add if it looks like a route (starts with / or is a valid route pattern)
    if (route.startsWith('/') || route.startsWith('./') || route.match(/^[a-zA-Z0-9_-]+$/)) {
      routes.push(route);
    }
  }
  
  // Also try to extract from Vue Router createRouter patterns
  const vueRouterRegex = /createRouter\([\s\S]*?routes:\s*\[([\s\S]*?)\]/g;
  let vueMatch;
  while ((vueMatch = vueRouterRegex.exec(content)) !== null) {
    const routesBlock = vueMatch[1];
    const pathMatches = routesBlock.match(/path:\s*['"`]([^'"`]+)['"`]/g);
    if (pathMatches) {
      pathMatches.forEach((pm: string) => {
        const pathMatch = pm.match(/['"`]([^'"`]+)['"`]/);
        if (pathMatch && pathMatch[1]) {
          const route = pathMatch[1].trim();
          if (route.startsWith('/') || route.startsWith('./')) {
            routes.push(route);
          }
        }
      });
    }
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
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath).toLowerCase();
  
  // Check for excluded file extensions (.dll, .pdb, etc.)
  const excludedExtensions = [".dll", ".pdb", ".exe", ".so", ".dylib", ".bin"];
  if (excludedExtensions.includes(fileExt)) {
    return false;
  }

  // Check exclude patterns (folders and file names)
  for (const pattern of options.excludePatterns) {
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = filePath.replace(/\\/g, "/");
    const normalizedPattern = pattern.replace(/\\/g, "/");
    
    // Check if pattern matches file path or name
    if (normalizedPath.includes(normalizedPattern) || 
        fileName.includes(pattern) ||
        normalizedPath.includes(`/${pattern}/`) ||
        normalizedPath.endsWith(`/${pattern}`)) {
      return false;
    }
  }

  // Check include patterns (if any specified)
  if (options.includePatterns.length > 0) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const matches = options.includePatterns.some((pattern) => {
      const normalizedPattern = pattern.replace(/\\/g, "/");
      return normalizedPath.includes(normalizedPattern) || fileName.includes(pattern);
    });
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
      
      // Skip common build/output directories and hidden files
      if (file.startsWith(".") || 
          file === "node_modules" || 
          file === "dist" || 
          file === "build" || 
          file === "bin" || 
          file === "obj" ||
          file === "tests" ||
          file === "test" ||
          file === "__tests__") {
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
          language: d.file.language,
          // Include first 500 chars of content for context
          codePreview: d.file.content.substring(0, 500),
        }))
      ),
    routes: codeDocs
      .filter((d) => d.routes && d.routes.length > 0)
      .flatMap((d) =>
        (d.routes || []).map((r) => ({
          path: r,
          file: d.file.path,
          // Include route definition context
          codePreview: d.file.content.substring(0, 500),
        }))
      ),
    apis: codeDocs
      .filter((d) => d.apis && d.apis.length > 0)
      .flatMap((d) =>
        (d.apis || []).map((a) => ({
          endpoint: a,
          file: d.file.path,
          codePreview: d.file.content.substring(0, 500),
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
    // Include all important files with their content previews
    keyFiles: codeDocs
      .filter((d) => 
        d.file.type === "component" || 
        d.file.type === "route" || 
        d.file.type === "api" ||
        d.file.path.includes("/views/") ||
        d.file.path.includes("/components/") ||
        d.file.path.includes("/stores/") ||
        d.file.path.includes("/router/")
      )
      .map((d) => ({
        path: d.file.path,
        type: d.file.type,
        language: d.file.language,
        summary: d.summary,
        components: d.components || [],
        functions: d.functions || [],
        routes: d.routes || [],
        // Include code preview (first 1000 chars) for better analysis
        codePreview: d.file.content.substring(0, 1000),
        // Include file size for context
        size: d.file.content.length,
      })),
    technologies: [
      ...new Set(codeDocs.map((d) => d.file.language)),
    ],
    // Group files by directory for better structure understanding
    fileStructure: {
      views: codeDocs.filter((d) => d.file.path.includes("/views/")).map((d) => d.file.path),
      components: codeDocs.filter((d) => d.file.path.includes("/components/")).map((d) => d.file.path),
      stores: codeDocs.filter((d) => d.file.path.includes("/stores/")).map((d) => d.file.path),
      router: codeDocs.filter((d) => d.file.path.includes("/router/")).map((d) => d.file.path),
    },
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
Analyze the provided codebase structure and generate COMPREHENSIVE, DETAILED documentation that includes:

1. **Overview**: A detailed, high-level description of what the application does, its purpose, main features, and target users. Be specific and descriptive.

2. **Architecture**: Detailed architecture description including:
   - Framework and patterns used (e.g., Vue.js, component-based, MVC, etc.)
   - Directory structure and organization
   - State management approach
   - Routing strategy
   - Data flow patterns

3. **Components**: For EACH component/view, provide:
   - What it does (detailed functionality)
   - Its role in the application
   - Key features and capabilities
   - How it relates to other components

4. **Routes**: For EACH route, provide:
   - What page/screen it displays
   - User flow and navigation context
   - Parameters and their purpose
   - Related components/views

5. **Key Files**: For important files, explain:
   - Their purpose and responsibility
   - Why they're important
   - What they contain/export

6. **Design Patterns**: Identify and explain patterns used (e.g., Component Pattern, Router Pattern, Store Pattern, etc.)

7. **Technologies**: List all technologies, frameworks, and libraries used

8. **Features**: List main features and capabilities of the application

Be VERY comprehensive, detailed, and specific. Write as if documenting for developers who need to understand the entire application. Use the code previews to infer actual functionality.`,
        },
        {
          role: "user",
          content: `Analyze this codebase in detail:

**Total Files:** ${structuredData.totalFiles}
**Technologies:** ${structuredData.technologies.join(", ")}

**File Structure:**
- Views: ${structuredData.fileStructure.views.length} files
- Components: ${structuredData.fileStructure.components.length} files
- Stores: ${structuredData.fileStructure.stores.length} files
- Router: ${structuredData.fileStructure.router.length} files

**Components Found:**
${structuredData.components.map((c) => `- ${c.name} (${c.file}, ${c.type}, ${c.language})`).join("\n")}

**Routes Found:**
${structuredData.routes.map((r) => `- ${r.path} (${r.file})`).join("\n")}

**API Endpoints Found:**
${structuredData.apis.length > 0 ? structuredData.apis.map((a) => `- ${a.endpoint} (${a.file})`).join("\n") : "None found"}

**Key Files with Code Context:**
${structuredData.keyFiles.map((f) => `
**${f.path}** (${f.type}, ${f.language}, ${f.size} chars)
- Components: ${f.components.join(", ") || "None"}
- Functions: ${f.functions.slice(0, 5).join(", ") || "None"}
- Routes: ${f.routes.join(", ") || "None"}
- Code Preview:
\`\`\`${f.language}
${f.codePreview}
\`\`\`
`).join("\n")}

Generate a COMPREHENSIVE and DETAILED analysis in JSON format with this structure:
{
  "overview": "Detailed, comprehensive description of what the application does, its purpose, main features, target users, and use cases. Be very specific and descriptive.",
  "architecture": "Detailed architecture description including framework, patterns, directory structure, state management, routing, and data flow. Be comprehensive.",
  "features": ["Feature 1", "Feature 2", ...],
  "components": [{"name": "...", "file": "...", "description": "Detailed description of what this component does, its purpose, features, and role in the application"}],
  "routes": [{"path": "...", "file": "...", "description": "Detailed description of what this route displays, user flow, parameters, and related components"}],
  "apis": [{"endpoint": "...", "method": "...", "file": "...", "description": "Detailed API endpoint documentation"}],
  "keyFiles": [{"path": "...", "type": "...", "importance": "Detailed explanation of why this file is important and what it contains"}],
  "patterns": ["Pattern 1 with explanation", "Pattern 2 with explanation"],
  "technologies": ["Technology 1", "Technology 2", ...]
}

Be VERY detailed and comprehensive. Analyze the code previews to understand actual functionality.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000, // Increased for more comprehensive documentation
    });

    const analysis = JSON.parse(
      response.choices[0]?.message?.content || "{}"
    ) as ComprehensiveCodeAnalysis;

    // Ensure all arrays exist
    return {
      overview: analysis.overview || "No overview available.",
      architecture: analysis.architecture || "No architecture description available.",
      features: analysis.features || [],
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

