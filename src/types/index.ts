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
}

export interface AnalyzeJobPayload {
  jobId: string;
  url: string;
  context?: string;
}

export interface PageSpeedSeoSummary {
  score: number | null;
  audits: Record<string, { title?: string; description?: string; score?: number | null }>;
  rawCategoryScore?: number | null;
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

export interface GeminiStructuredOutput {
  primary_keywords: string[];
  secondary_keywords: string[];
  meta_updates: {
    title: string;
    description: string;
  };
  code_changes: Array<{
    file: string;
    before: string;
    after: string;
  }>;
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export interface DiffBundle {
  jsonPatch: JsonPatchOperation[];
  gitStyleDiff: string;
}

export interface EditorPromptBundle {
  prompt: string;
}

export interface AnalysisResult {
  url: string;
  context?: string;
  seoScore: number | null;
  geoScore: GeoScoreBreakdown;
  normalized: NormalizedSnapshot;
  gemini: GeminiStructuredOutput;
  diffs: DiffBundle;
  editorPrompt: EditorPromptBundle;
  meta: {
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
