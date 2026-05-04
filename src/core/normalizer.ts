import type { NormalizedSnapshot, PageSpeedSeoSummary, ParsedPageMeta } from "../types/index.js";

export function buildNormalizedSnapshot(params: {
  url: string;
  context?: string;
  pageSpeed: PageSpeedSeoSummary;
  parsed: ParsedPageMeta;
}): NormalizedSnapshot {
  const issues: string[] = [];
  for (const m of params.parsed.missing) {
    issues.push(`Missing ${m}`);
  }
  if (params.parsed.hreflangLinks.length === 0 && !params.parsed.htmlLang) {
    issues.push("No hreflang alternates and no html[lang] attribute");
  }
  if (params.pageSpeed.score !== null && params.pageSpeed.score < 80) {
    issues.push(`Lighthouse SEO category score is below 80 (${params.pageSpeed.score})`);
  }

  const lowScoreAudits = Object.entries(params.pageSpeed.audits)
    .filter(([, a]) => typeof a.score === "number" && a.score < 50)
    .slice(0, 8)
    .map(([id]) => `Audit ${id} has low score`);

  issues.push(...lowScoreAudits);

  return {
    url: params.url,
    context: params.context,
    pageSpeed: params.pageSpeed,
    parsed: params.parsed,
    issues: Array.from(new Set(issues)),
  };
}
