import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { GeminiStructuredOutput, NormalizedSnapshot } from "../types/index.js";
import { logger } from "../utils/logger.js";

const MODEL_ID = "gemini-1.5-flash";
const TIMEOUT_MS = 8000;

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    primary_keywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    secondary_keywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    meta_updates: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
      },
      required: ["title", "description"],
    },
    code_changes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          file: { type: SchemaType.STRING },
          before: { type: SchemaType.STRING },
          after: { type: SchemaType.STRING },
        },
        required: ["file", "before", "after"],
      },
    },
  },
  required: ["primary_keywords", "secondary_keywords", "meta_updates", "code_changes"],
};

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return new GoogleGenerativeAI(key);
}

function isValidShape(obj: unknown): obj is GeminiStructuredOutput {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.primary_keywords) || !o.primary_keywords.every((x) => typeof x === "string"))
    return false;
  if (!Array.isArray(o.secondary_keywords) || !o.secondary_keywords.every((x) => typeof x === "string"))
    return false;
  const mu = o.meta_updates;
  if (!mu || typeof mu !== "object") return false;
  const m = mu as Record<string, unknown>;
  if (typeof m.title !== "string" || typeof m.description !== "string") return false;
  if (!Array.isArray(o.code_changes)) return false;
  for (const c of o.code_changes) {
    if (!c || typeof c !== "object") return false;
    const cc = c as Record<string, unknown>;
    if (typeof cc.file !== "string" || typeof cc.before !== "string" || typeof cc.after !== "string")
      return false;
  }
  return true;
}

export async function generateRecommendations(snapshot: NormalizedSnapshot): Promise<GeminiStructuredOutput> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });

  const userPayload = {
    url: snapshot.url,
    context: snapshot.context ?? "",
    page_seo_score: snapshot.pageSpeed.score,
    audits_summary: Object.keys(snapshot.pageSpeed.audits).slice(0, 25),
    parsed: snapshot.parsed,
    issues: snapshot.issues,
  };

  const prompt = `You are an SEO and internationalization expert. Based on the following page analysis JSON, produce concise improvements.
Rules:
- primary_keywords: 3-8 high-intent phrases
- secondary_keywords: 5-12 supporting phrases
- meta_updates: improved title and meta description (plain text)
- code_changes: minimal HTML snippets for index.html showing before/after for critical fixes (use empty string for before if adding new block)
Output MUST strictly follow the JSON schema.`;

  const result = await model.generateContent(
    {
      contents: [{ role: "user", parts: [{ text: prompt + "\n\nDATA:\n" + JSON.stringify(userPayload) }] }],
    },
    { timeout: TIMEOUT_MS }
  );

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gemini returned non-JSON");
  }
  if (!isValidShape(parsed)) {
    throw new Error("Gemini JSON failed validation");
  }
  logger.debug("gemini_ok", { url: snapshot.url });
  return parsed;
}
