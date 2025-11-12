# 🎥 Visual Walkthrough Generator

An AI-powered CLI tool that automatically documents web applications by taking screenshots and generating descriptions using GPT-4o Vision.

## ✨ Features

- 🤖 **AI-Powered Descriptions**: Uses GPT-4o Vision to generate clear, user-friendly descriptions of web pages
- 📸 **Automated Screenshots**: Captures full-page screenshots using Playwright
- 🕷️ **Auto-Crawl Mode**: Automatically discovers and documents all pages on a website
- 📚 **Codebase Analysis**: Analyzes source code to extract components, routes, APIs, and generate documentation
- 📝 **Markdown Output**: Generates beautiful, structured Markdown documentation
- 🗺️ **Navigation Diagrams**: Automatically creates Mermaid diagrams for multi-page walkthroughs
- 🚀 **Easy CLI**: Simple command-line interface with flexible URL input

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

This approach is much more efficient and produces better documentation than analyzing files one-by-one:

**Option 1: Use the wrapper script (Windows - Recommended)**
```bash
walkthrough.cmd https://example.com --analyze-code --codebase-path ./src
```

**Option 2: Direct node command**
```bash
npm run build
node dist/index.js https://example.com --analyze-code --codebase-path ./src
```

**Code Analysis Options:**
- `--analyze-code` or `--code`: Enable code analysis mode
- `--codebase-path <path>`: Path to codebase directory (default: `./src`)
- `--code-exclude <patterns>`: Comma-separated patterns to exclude (default: excludes node_modules, .git, dist, etc.)
- `--code-include <patterns>`: Comma-separated patterns to include (optional)
- `--max-file-size <kb>`: Maximum file size to analyze in KB (default: 100KB)

**Examples:**
```bash
# Analyze codebase with default settings
walkthrough.cmd https://example.com --analyze-code

# Analyze specific codebase path
walkthrough.cmd https://example.com --analyze-code --codebase-path ../my-app/src

# Analyze only components and routes
walkthrough.cmd https://example.com --analyze-code --code-include "/components,/routes"

# Combine crawl + code analysis
walkthrough.cmd https://example.com --crawl --analyze-code --codebase-path ./src
```

#### Development Mode

For faster iteration during development:

```bash
npm run dev https://example.com
```

### Output

The tool generates:

- **`WALKTHROUGH.md`**: Main documentation file with screenshots and descriptions
- **`images/`**: Folder containing all captured screenshots

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

- Table of contents
- Navigation flow diagram (Mermaid)
- Each page with:
  - Screenshot
  - AI-generated description
  - URL and timestamp

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

