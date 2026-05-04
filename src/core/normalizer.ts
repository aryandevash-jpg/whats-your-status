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
  if (params.pageSpeed.categoryScore !== null && params.pageSpeed.categoryScore < 80) {
    issues.push(`Lighthouse SEO category score is below 80 (${params.pageSpeed.categoryScore}/100).`);
  }

  const failedSeoChecks = Object.entries(params.pageSpeed.audits)
    .filter(([, a]) => a.outcome === "fail" || a.outcome === "error")
    .slice(0, 12)
    .map(([id, a]) => `SEO: ${a.title ?? id} (${id}) — ${a.outcomeLabel}`);

  issues.push(...failedSeoChecks);

  return {
    url: params.url,
    context: params.context,
    pageSpeed: params.pageSpeed,
    parsed: params.parsed,
    issues: Array.from(new Set(issues)),
  };
}
