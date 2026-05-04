import type { AnalysisSuggestions, GeminiStructuredOutput, ParsedPageMeta } from "../types/index.js";

/** Human-oriented view of what to change, without HTML patches or git diffs. */
export function buildAnalysisSuggestions(
  parsed: ParsedPageMeta,
  gemini: GeminiStructuredOutput
): AnalysisSuggestions {
  return {
    meta: {
      currentTitle: parsed.title,
      currentDescription: parsed.metaDescription,
      suggestedTitle: gemini.meta_updates.title,
      suggestedDescription: gemini.meta_updates.description,
    },
  };
}
