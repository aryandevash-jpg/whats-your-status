import type { GeoScoreBreakdown, ParsedPageMeta } from "../types/index.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function scoreHreflang(parsed: ParsedPageMeta): number {
  if (parsed.hreflangLinks.length > 0) return 40;
  if (parsed.htmlLang) return 20;
  return 0;
}

function scoreRegionKeywords(parsed: ParsedPageMeta, context?: string): number {
  if (!context?.trim()) return 15;
  const tokens = context
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return 15;

  const hay = [
    parsed.title ?? "",
    parsed.metaDescription ?? "",
    ...parsed.h1,
    ...parsed.h2,
  ]
    .join(" ")
    .toLowerCase();

  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits++;
  }
  const ratio = hits / tokens.length;
  return clamp(Math.round(45 * ratio), 0, 45);
}

export function computeGeoScore(
  parsed: ParsedPageMeta,
  context?: string,
  placeholderLatencyMs?: number
): GeoScoreBreakdown {
  const hreflangScore = scoreHreflang(parsed);
  const regionKeywordScore = scoreRegionKeywords(parsed, context);

  let latencyPlaceholderScore = 15;
  if (typeof placeholderLatencyMs === "number") {
    if (placeholderLatencyMs < 300) latencyPlaceholderScore = 25;
    else if (placeholderLatencyMs < 800) latencyPlaceholderScore = 20;
    else if (placeholderLatencyMs < 2000) latencyPlaceholderScore = 10;
    else latencyPlaceholderScore = 5;
  }

  const total = clamp(hreflangScore + regionKeywordScore + latencyPlaceholderScore, 0, 100);

  return {
    hreflangScore,
    regionKeywordScore,
    latencyPlaceholderScore,
    total,
  };
}
