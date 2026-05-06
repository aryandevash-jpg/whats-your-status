export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  result: AnalysisResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyzeRequestBody {
  url: string;
  context?: string;
  /** When true, bypass Redis pipeline snapshot for this URL and re-run PageSpeed, scrape, and Gemini. */
  skipPipelineCache?: boolean;
}

export interface AnalyzeJobPayload {
  jobId: string;
  url: string;
  context?: string;
  skipPipelineCache?: boolean;
}

/** Lighthouse SEO audit row — `outcome` is the meaningful signal; category score is separate. */
export type SeoAuditOutcome = "pass" | "fail" | "not_applicable" | "informational" | "error";

export interface PageSpeedSeoAuditRow {
  title?: string;
  description?: string;
  /** Lighthouse `scoreDisplayMode` (e.g. binary, notApplicable). */
  scoreDisplayMode?: string;
  /** Raw Lighthouse audit score 0–1 when present. */
  lighthouseScore: number | null;
  outcome: SeoAuditOutcome;
  /** Short copy for tables and UI. */
  outcomeLabel: string;
}

export interface PageSpeedSeoSummary {
  /** Weighted Lighthouse SEO *category* score (0–100). Not an average of per-audit rows. */
  categoryScore: number | null;
  /** Raw Lighthouse category score (0–1). */
  rawCategoryScore: number | null;
  /** One sentence explaining how to read `categoryScore` vs audits. */
  categorySummary: string;
  /** Counts for audits included in this SEO report (from Lighthouse SEO `auditRefs`). */
  auditRollup: {
    total: number;
    passed: number;
    failed: number;
    notApplicable: number;
    informational: number;
    errors: number;
  };
  audits: Record<string, PageSpeedSeoAuditRow>;
}

export interface ParsedPageMeta {
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  missing: string[];
  hreflangLinks: { hreflang: string; href: string }[];
  htmlLang: string | null;
}

export interface NormalizedSnapshot {
  url: string;
  context?: string;
  pageSpeed: PageSpeedSeoSummary;
  parsed: ParsedPageMeta;
  issues: string[];
}

export interface GeoScoreBreakdown {
  hreflangScore: number;
  regionKeywordScore: number;
  latencyPlaceholderScore: number;
  total: number;
}

/** LLM output: framework-agnostic guidance (no HTML before/after snippets). */
export interface GeminiStructuredOutput {
  primary_keywords: string[];
  secondary_keywords: string[];
  meta_updates: {
    title: string;
    description: string;
  };
  recommendations: Array<{
    topic: string;
    rationale: string;
    action: string;
  }>;
}

/** Deterministic summary for the client (no parsed-HTML diffs). */
export interface AnalysisSuggestions {
  meta: {
    currentTitle: string | null;
    currentDescription: string | null;
    suggestedTitle: string;
    suggestedDescription: string;
  };
}

export interface EditorPromptBundle {
  prompt: string;
}

export interface AnalysisResult {
  url: string;
  context?: string;
  /** Same as `pageSpeed.categoryScore` — Lighthouse weighted SEO category (0–100). */
  seoScore: number | null;
  geoScore: GeoScoreBreakdown;
  normalized: NormalizedSnapshot;
  gemini: GeminiStructuredOutput;
  suggestions: AnalysisSuggestions;
  editorPrompt: EditorPromptBundle;
  meta: {
    /** True when PageSpeed + scrape + Gemini snapshot was reused from Redis (~10 min TTL), not regenerated. */
    cached: boolean;
    completedAt: string;
  };
}

export interface CachedPipelineSnapshot {
  pageSpeed: PageSpeedSeoSummary;
  parsed: ParsedPageMeta;
  normalized: NormalizedSnapshot;
  geoScore: GeoScoreBreakdown;
  gemini: GeminiStructuredOutput;
}

export type ErrorClass = "retryable" | "non_retryable";
