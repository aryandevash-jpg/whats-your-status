const baseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error("Empty response");
  return JSON.parse(text) as T;
}

export async function postAnalyze(body: {
  url: string;
  context?: string;
  skipPipelineCache?: boolean;
}): Promise<{ jobId: string; status: string }> {
  const res = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return parseJson(res);
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export async function getStatus(jobId: string): Promise<{
  jobId: string;
  status: JobStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}> {
  const res = await fetch(`${baseUrl}/status/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(await res.text());
  return parseJson(res);
}

export type AnalysisResult = {
  url: string;
  context?: string;
  seoScore: number | null;
  geoScore: { hreflangScore: number; regionKeywordScore: number; latencyPlaceholderScore: number; total: number };
  normalized: {
    url: string;
    context?: string;
    issues: string[];
    pageSpeed: {
      categoryScore: number | null;
      rawCategoryScore: number | null;
      categorySummary: string;
      auditRollup: {
        total: number;
        passed: number;
        failed: number;
        notApplicable: number;
        informational: number;
        errors: number;
      };
      audits: Record<
        string,
        {
          title?: string;
          description?: string;
          scoreDisplayMode?: string;
          lighthouseScore: number | null;
          outcome: string;
          outcomeLabel: string;
        }
      >;
    };
    parsed: {
      title: string | null;
      metaDescription: string | null;
      h1: string[];
      h2: string[];
      h3: string[];
      missing: string[];
      hreflangLinks: { hreflang: string; href: string }[];
      htmlLang: string | null;
    };
  };
  gemini: {
    primary_keywords: string[];
    secondary_keywords: string[];
    meta_updates: { title: string; description: string };
    recommendations: Array<{ topic: string; rationale: string; action: string }>;
  };
  suggestions: {
    meta: {
      currentTitle: string | null;
      currentDescription: string | null;
      suggestedTitle: string;
      suggestedDescription: string;
    };
  };
  editorPrompt: { prompt: string };
  meta: { cached: boolean; completedAt: string };
};

export async function getResult(jobId: string): Promise<{
  jobId: string;
  status: "completed";
  result: AnalysisResult;
}> {
  const res = await fetch(`${baseUrl}/result/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(await res.text());
  return parseJson(res);
}
