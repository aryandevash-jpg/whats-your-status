import type { AnalysisResult, GeminiStructuredOutput, NormalizedSnapshot } from "../types/index.js";

export function buildEditorPrompt(params: {
  snapshot: NormalizedSnapshot;
  gemini: GeminiStructuredOutput;
}): string {
  const { snapshot, gemini } = params;

  const lines: string[] = [
    "You are an expert web engineer and SEO editor. Apply the following improvements to the site HTML and metadata.",
    "",
    "## Constraints",
    "- Preserve existing branding, analytics snippets, and consent banners unless they conflict with SEO.",
    "- Do not remove accessibility attributes.",
    "- Keep changes minimal and valid HTML5.",
    "- Prefer updating <title> and meta name=\"description\" in <head>.",
    "",
    "## Target URL",
    snapshot.url,
    "",
    "## Business / region context",
    snapshot.context?.trim() || "(none provided)",
    "",
    "## Keywords to emphasize",
    "Primary:",
    ...gemini.primary_keywords.map((k) => `- ${k}`),
    "",
    "Secondary:",
    ...gemini.secondary_keywords.map((k) => `- ${k}`),
    "",
    "## Meta updates",
    `title: ${gemini.meta_updates.title}`,
    `description: ${gemini.meta_updates.description}`,
    "",
    "## Code edits (conceptual files)",
    ...gemini.code_changes.flatMap((c) => [
      `### ${c.file}`,
      "Before:",
      "```",
      c.before || "(empty)",
      "```",
      "After:",
      "```",
      c.after,
      "```",
      "",
    ]),
    "## Instructions",
    "1. Merge meta updates into the page head.",
    "2. Apply code changes carefully; if a snippet is partial, integrate it with surrounding DOM.",
    "3. Ensure one clear H1 and logical heading order.",
    "4. If hreflang is missing, suggest link[rel=alternate] entries for locales mentioned in context.",
  ];

  return lines.join("\n");
}

export function buildEditorPromptFromResult(result: AnalysisResult): string {
  return buildEditorPrompt({ snapshot: result.normalized, gemini: result.gemini });
}
