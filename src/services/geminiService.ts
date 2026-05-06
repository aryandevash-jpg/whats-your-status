import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { GeminiStructuredOutput, NormalizedSnapshot } from "../types/index.js";
import { httpTimeoutMs } from "../utils/httpTimeouts.js";
import { logger } from "../utils/logger.js";

const DEFAULT_MODEL_ID = "gemini-2.5-flash";

function resolveModelId(): string {
  const id = process.env.GEMINI_MODEL?.trim();
  return id || DEFAULT_MODEL_ID;
}

const TIMEOUT_MS = httpTimeoutMs("GEMINI_TIMEOUT_MS", 60_000);

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
    recommendations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          topic: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          action: { type: SchemaType.STRING },
        },
        required: ["topic", "rationale", "action"],
      },
    },
  },
  required: ["primary_keywords", "secondary_keywords", "meta_updates", "recommendations"],
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
  if (!Array.isArray(o.recommendations) || o.recommendations.length < 1) return false;
  for (const r of o.recommendations) {
    if (!r || typeof r !== "object") return false;
    const rec = r as Record<string, unknown>;
    if (typeof rec.topic !== "string" || !rec.topic.trim()) return false;
    if (typeof rec.rationale !== "string" || !rec.rationale.trim()) return false;
    if (typeof rec.action !== "string" || !rec.action.trim()) return false;
  }
  return true;
}

export async function generateRecommendations(snapshot: NormalizedSnapshot): Promise<GeminiStructuredOutput> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: resolveModelId(),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.4,
      maxOutputTokens: 3072,
    },
  });

  const userPayload = {
    url: snapshot.url,
    context: snapshot.context ?? "",
    page_seo_score: snapshot.pageSpeed.categoryScore,
    page_seo_summary: snapshot.pageSpeed.categorySummary,
    audits_needing_attention: Object.entries(snapshot.pageSpeed.audits)
      .filter(([, a]) => a.outcome === "fail" || a.outcome === "error")
      .slice(0, 20)
      .map(([id, a]) => ({ id, outcome: a.outcome, label: a.outcomeLabel, title: a.title })),
    parsed: snapshot.parsed,
    issues: snapshot.issues,
  };

  const prompt = `You are an SEO and internationalization expert. Based on the following page analysis JSON, produce concise improvements.

Rules:
- primary_keywords: 3-8 high-intent phrases
- secondary_keywords: 5-12 supporting phrases
- meta_updates: improved title and meta description (plain text only)
- recommendations: 5-10 items. The site may use any stack (React, Vue, Next.js, WordPress, etc.). Do NOT output HTML snippets, file paths, or git-style diffs.
  For each item:
  - topic: short heading (e.g. "Heading hierarchy", "Hreflang for locales")
  - rationale: 1-3 sentences tied to this page's signals (parsed fields, issues, audits)
  - action: concrete steps an engineer or content editor can take in their own framework—describe WHAT to achieve, not a specific HTML patch

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
