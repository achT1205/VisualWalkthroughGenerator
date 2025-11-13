# 🎥 Visual Walkthrough Generator

An AI-powered CLI tool that automatically documents web applications by taking screenshots and generating descriptions using GPT-4o Vision.

## ✨ Features

- 🤖 **AI-Powered Descriptions**: Uses GPT-4o Vision to generate clear, user-friendly descriptions of web pages
- 📸 **Automated Screenshots**: Captures full-page screenshots using Playwright
- 🕷️ **Auto-Crawl Mode**: Automatically discovers and documents all pages on a website
- 📋 **Form Auto-Fill**: Automatically detects, fills, and submits forms to access protected pages
- 📚 **Comprehensive Codebase Analysis**: Two-phase analysis with code previews for detailed documentation of architecture, components, routes, APIs, and patterns
- 📝 **Markdown Output**: Generates beautiful, structured Markdown documentation
- 🗺️ **Navigation Diagrams**: Automatically creates Mermaid diagrams for multi-page walkthroughs
- 🚀 **Easy CLI**: Simple command-line interface with flexible URL input
- 🎯 **Three Documentation Modes**: Interface only, codebase only, or combined documentation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key

### Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-api-key-here
   ```

4. **Install Playwright browsers**
   ```bash
   npx playwright install chromium
   ```

### Usage

#### Manual URL Mode

Provide URLs as command-line arguments:

```bash
npm run walkthrough https://example.com https://example.com/about
```

Or use the default URLs in `src/config.ts`:

```bash
npm run walkthrough
```

#### Automatic Crawl Mode 🕷️

Automatically discover and document all pages on a website:

**Option 1: Use the wrapper script (Windows - Recommended)**
```bash
walkthrough.cmd https://example.com --crawl
```

**Option 2: Direct node command**
```bash
npm run build
node dist/index.js https://example.com --crawl
```

**Option 3: Using npm script (requires `--` separator)**
```bash
npm run walkthrough -- https://example.com --crawl
```

**Crawl Options:**
- `--crawl` or `-c`: Enable crawl mode
- `--max-depth <number>`: Maximum crawl depth (default: 3)
- `--max-pages <number>`: Maximum pages to discover (default: 50)
- `--exclude <patterns>`: Comma-separated patterns to exclude (default: excludes PDFs, images, mailto, etc.)
- `--include <patterns>`: Comma-separated patterns to include (optional)
- `--auto-fill-forms`: Automatically fill and submit forms (enabled by default)
- `--no-auto-fill-forms`: Disable automatic form filling

**Examples:**
```bash
# Basic crawl
npm run walkthrough https://example.com --crawl

# Crawl with custom depth and page limit
npm run walkthrough https://example.com --crawl --max-depth 2 --max-pages 20

# Crawl excluding specific paths
npm run walkthrough https://example.com --crawl --exclude "/admin,/private"
```

#### Codebase Analysis Mode 📚

Analyze the application's source code using a **two-phase approach**:
1. **Phase 1**: Fast extraction of code structure (components, routes, APIs) - no AI calls
2. **Phase 2**: Comprehensive AI-powered analysis that generates architecture overview, patterns, and relationships

This approach is much more efficient and produces better documentation than analyzing files one-by-one. The tool includes **code previews** (first 500-1000 characters) for better context, allowing GPT to understand actual functionality rather than just file names.

**Code Analysis Options:**
- `--analyze-code` or `--code`: Enable code analysis mode
- `--codebase-path <path>`: Path to codebase directory (required when using `--analyze-code`)
- `--code-exclude <patterns>`: Comma-separated patterns to exclude (default: excludes node_modules, .git, dist, etc.)
- `--code-include <patterns>`: Comma-separated patterns to include (optional)
- `--max-file-size <kb>`: Maximum file size to analyze in KB (default: 100KB)

**Three Documentation Modes:**

1. **Interface + Codebase** (Combined documentation):
   ```bash
   # Windows
   walkthrough.cmd http://localhost:3000 --crawl --analyze-code --codebase-path C:\path\to\codebase
   
   # Direct node
   npm run build
   node dist/index.js http://localhost:3000 --crawl --analyze-code --codebase-path ./src
   ```

2. **Interface Only** (Visual walkthrough only):
   ```bash
   # Windows
   walkthrough.cmd http://localhost:3000 --crawl
   
   # Direct node
   npm run build
   node dist/index.js http://localhost:3000 --crawl
   ```

3. **Codebase Only** (Code documentation only):
   ```bash
   # Windows
   walkthrough.cmd --analyze-code --codebase-path C:\path\to\codebase
   
   # Direct node
   npm run build
   node dist/index.js --analyze-code --codebase-path ./src
   ```

**Examples:**
```bash
# Analyze codebase with default settings (combined with interface)
walkthrough.cmd https://example.com --crawl --analyze-code --codebase-path ./src

# Codebase-only documentation
walkthrough.cmd --analyze-code --codebase-path ../my-app/src

# Analyze only components and routes
walkthrough.cmd https://example.com --analyze-code --codebase-path ./src --code-include "/components,/routes"

# Local development with full documentation
walkthrough.cmd http://localhost:3000 --crawl --analyze-code --codebase-path C:\Users\YourName\source\repos\MyApp
```

#### Development Mode

For faster iteration during development:

```bash
npm run dev https://example.com
```

### Output

The tool generates all output files in the `output/` folder:

- **`output/WALKTHROUGH.md`**: Main documentation file with screenshots and descriptions
- **`output/WALKTHROUGH.html`**: HTML version with **interactive Mermaid diagrams** that render directly in your browser (generated automatically when multiple pages are documented)
- **`output/images/`**: Folder containing all captured screenshots

The `output/` folder is automatically created if it doesn't exist.

**💡 Viewing Mermaid Diagrams:**
- **Markdown**: Use a viewer that supports Mermaid (GitHub, GitLab, VS Code with Mermaid extension, or [Mermaid Live Editor](https://mermaid.live))
- **HTML**: Simply open `WALKTHROUGH.html` in any web browser - diagrams render automatically!

## 📁 Project Structure

```
visual-walkthrough-generator/
├── src/
│   ├── index.ts            # Main entry point
│   ├── playwright.ts       # Screenshot capture logic
│   ├── crawler.ts          # Website crawling/discovery
│   ├── codeAnalyzer.ts     # Codebase analysis and documentation
│   ├── openaiClient.ts     # GPT-4o Vision API integration
│   ├── markdownBuilder.ts  # Markdown generation
│   └── config.ts           # Configuration and URL management
├── images/                 # Generated screenshots (gitignored)
├── dist/                   # Compiled TypeScript (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## ⚙️ Configuration

Edit `src/config.ts` to customize:

- Default URLs
- Output file name
- Screenshot options (full page, timeout, etc.)
- Image directory path

## 🎯 Example Output

The generated `WALKTHROUGH.md` includes:

### Interface Documentation (when using `--crawl`):
- Table of contents
- Navigation flow diagram (Mermaid)
- Each page with:
  - Screenshot (before/after form submission if applicable)
  - AI-generated description
  - URL and timestamp

### Codebase Documentation (when using `--analyze-code`):
- **Overview**: Detailed description of the application, its purpose, features, and target users
- **Architecture**: Framework, patterns, directory structure, state management, routing, and data flow
- **Main Features**: List of key application capabilities
- **Technologies**: All technologies, frameworks, and libraries used
- **Design Patterns**: Identified patterns with explanations
- **Components & Views**: Detailed descriptions of each component/view with:
  - What it does
  - Its role in the application
  - Key features and capabilities
  - How it relates to other components
- **Routes & Navigation**: For each route:
  - What page/screen it displays
  - User flow and navigation context
  - Parameters and their purpose
  - Related components/views
- **API Endpoints**: Detailed API documentation (if applicable)
- **Key Files & Structure**: Important files with explanations of their purpose and importance

The codebase analysis uses **code previews** to provide context, resulting in more accurate and comprehensive documentation than metadata-only analysis.

## 🔧 Development

### Build

```bash
npm run build
```

### Run compiled code

```bash
npm start
```

## 🚧 Future Enhancements

- [x] Auto-crawl internal links ✅
- [ ] JIRA integration
- [ ] Confluence API integration
- [ ] Custom prompt templates
- [ ] Batch processing with progress bars
- [ ] Video walkthrough generation

## 📝 License

MIT

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

**Built with ❤️ using Playwright, OpenAI GPT-4o, and TypeScript**

