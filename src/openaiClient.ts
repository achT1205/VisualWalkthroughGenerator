/**
 * OpenAI GPT-4o Vision client for image description
 */

import OpenAI from "openai";
import { readFileSync } from "fs";
import path from "path";

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. Please create a .env file with your API key."
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Convert image file to base64 data URL
 */
function imageToBase64(imagePath: string): string {
  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString("base64");
  // Determine MIME type from file extension
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/png";
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Describe a screenshot using GPT-4o Vision
 */
export async function describeScreenshot(
  imagePath: string,
  title: string,
  url: string
): Promise<string> {
  const client = getOpenAIClient();

  console.log(`🤖 Generating description for: ${title}`);

  try {
    // Convert image to base64
    const base64Image = imageToBase64(imagePath);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a UX documentation assistant. Generate a short, clear description of this web page for user documentation. Explain its purpose, key UI elements, and main user actions in 3-4 sentences. Avoid technical jargon. Be concise and user-friendly.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Describe this page titled "${title}" (URL: ${url}). Focus on what users can see and do on this page.`,
            },
            {
              type: "image_url",
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const description =
      response.choices[0]?.message?.content ||
      "No description available.";

    console.log(`✅ Description generated for: ${title}`);
    return description;
  } catch (error) {
    console.error(`❌ Error generating description for ${title}:`, error);
    return `Error generating description: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

