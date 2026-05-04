import type { AnalysisResult, GeminiStructuredOutput, NormalizedSnapshot } from "../types/index.js";

export function buildEditorPrompt(params: {
  snapshot: NormalizedSnapshot;
  gemini: GeminiStructuredOutput;
}): string {
  const { snapshot, gemini } = params;

  const lines: string[] = [
    "You are an expert web engineer and SEO editor. Improve this site using the analysis below.",
    "",
    "## Constraints",
    "- Preserve existing branding, analytics snippets, and consent banners unless they conflict with SEO.",
    "- Do not remove accessibility attributes.",
    "- Apply changes in whatever framework or CMS the project uses (do not assume a single index.html).",
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
    "## Meta updates (plain text)",
    `title: ${gemini.meta_updates.title}`,
    `description: ${gemini.meta_updates.description}`,
    "",
    "## Descriptive recommendations (implement in your stack)",
    ...gemini.recommendations.flatMap((r) => [
      `### ${r.topic}`,
      `Why: ${r.rationale}`,
      `What to do: ${r.action}`,
      "",
    ]),
    "## Instructions",
    "1. Update document title and meta description to match the meta updates (using the project's head/title/SEO APIs).",
    "2. Work through each recommendation: translate the intent into the correct components, routes, or templates for this codebase.",
    "3. Ensure one clear H1 and logical heading order.",
    "4. If hreflang is missing, add alternate links or equivalent configuration for locales implied by context.",
  ];

  return lines.join("\n");
}

export function buildEditorPromptFromResult(result: AnalysisResult): string {
  return buildEditorPrompt({ snapshot: result.normalized, gemini: result.gemini });
}
