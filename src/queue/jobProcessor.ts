import { createHash } from "node:crypto";
import { getRedis } from "../storage/redisClient.js";
import * as jobStore from "../storage/jobStore.js";
import { fetchPageSpeedSeo } from "../services/seoService.js";
import { scrapeHtml } from "../services/scraper.js";
import { parseHtml } from "../services/parser.js";
import { computeGeoScore } from "../services/geoScorer.js";
import { generateRecommendations } from "../services/geminiService.js";
import { buildNormalizedSnapshot } from "../core/normalizer.js";
import { analyzeSnapshot } from "../core/analyzer.js";
import { buildAnalysisSuggestions } from "../core/suggestions.js";
import { buildEditorPromptFromResult } from "../core/promptEngine.js";
import type {
  AnalysisResult,
  AnalyzeJobPayload,
  CachedPipelineSnapshot,
  SitemapCrawlReport,
  SitemapPageEntry,
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import { collectPageUrlsFromSitemap } from "../services/sitemap.js";
import { envClampedInt } from "../utils/httpTimeouts.js";

const CACHE_PREFIX = "seo_geo:pipeline:v3:";
const CACHE_TTL_SEC = 600;

function cacheKeyForUrl(url: string): string {
  const hash = createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
  return CACHE_PREFIX + hash;
}

async function readFullCache(url: string): Promise<CachedPipelineSnapshot | null> {
  const redis = getRedis();
  const raw = await redis.get(cacheKeyForUrl(url));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedPipelineSnapshot;
    if (
      !parsed?.pageSpeed ||
      typeof parsed.pageSpeed.categorySummary !== "string" ||
      !parsed?.parsed ||
      !parsed?.normalized ||
      !parsed?.geoScore ||
      !parsed?.gemini
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeFullCache(url: string, snap: CachedPipelineSnapshot): Promise<void> {
  const redis = getRedis();
  await redis.set(cacheKeyForUrl(url), JSON.stringify(snap), "EX", CACHE_TTL_SEC);
}

export class NonRetryablePipelineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryablePipelineError";
  }
}

function buildResultFromPipeline(params: {
  url: string;
  context?: string;
  pageSpeed: CachedPipelineSnapshot["pageSpeed"];
  parsed: CachedPipelineSnapshot["parsed"];
  normalized: CachedPipelineSnapshot["normalized"];
  geoScore: CachedPipelineSnapshot["geoScore"];
  gemini: CachedPipelineSnapshot["gemini"];
  fromCache: boolean;
}): AnalysisResult {
  const { url, context, pageSpeed, parsed, normalized, geoScore, gemini, fromCache } =
    params;
  const suggestions = buildAnalysisSuggestions(parsed, gemini);
  const result: AnalysisResult = {
    url,
    context,
    seoScore: pageSpeed.categoryScore,
    geoScore,
    normalized,
    gemini,
    suggestions,
    editorPrompt: { prompt: "" },
    meta: {
      cached: fromCache,
      completedAt: new Date().toISOString(),
    },
  };
  result.editorPrompt.prompt = buildEditorPromptFromResult(result);
  return result;
}

/**
 * Full analyze pipeline for one URL (PageSpeed, scrape, parse, GEO, Gemini).
 * Uses Redis snapshot when allowed. Does not touch job store.
 */
async function runFullPipelineForUrl(params: {
  url: string;
  context?: string;
  skipPipelineCache?: boolean;
}): Promise<AnalysisResult> {
  const { url, context, skipPipelineCache } = params;

  const fullCached = skipPipelineCache ? null : await readFullCache(url);
  if (fullCached) {
    const result = buildResultFromPipeline({
      url,
      context,
      pageSpeed: fullCached.pageSpeed,
      parsed: fullCached.parsed,
      normalized: {
        ...fullCached.normalized,
        context: context ?? fullCached.normalized.context,
      },
      geoScore: fullCached.geoScore,
      gemini: fullCached.gemini,
      fromCache: true,
    });
    await writeFullCache(url, {
      pageSpeed: fullCached.pageSpeed,
      parsed: fullCached.parsed,
      normalized: result.normalized,
      geoScore: fullCached.geoScore,
      gemini: fullCached.gemini,
    });
    return result;
  }

  const pipelineT0 = Date.now();
  let pageSpeedMs = 0;
  let scrapeMs = 0;
  let geminiMs = 0;

  let pageSpeed: CachedPipelineSnapshot["pageSpeed"];
  try {
    const tPs = Date.now();
    pageSpeed = await fetchPageSpeedSeo(url);
    pageSpeedMs = Date.now() - tPs;
  } catch (e) {
    throw e;
  }

  const t0 = Date.now();
  let html: string;
  try {
    const scraped = await scrapeHtml(url);
    html = scraped.html;
  } catch (e) {
    throw e;
  }
  scrapeMs = Date.now() - t0;
  const scrapeLatencyMs = scrapeMs;

  let parsed: CachedPipelineSnapshot["parsed"];
  try {
    parsed = parseHtml(html);
  } catch (err) {
    throw new NonRetryablePipelineError("HTML parsing failed", { cause: err });
  }

  const normalized = buildNormalizedSnapshot({
    url,
    context,
    pageSpeed,
    parsed,
  });

  const geoScore = computeGeoScore(parsed, context, scrapeLatencyMs);

  analyzeSnapshot(normalized);

  let geminiOut: CachedPipelineSnapshot["gemini"];
  try {
    const tGem = Date.now();
    geminiOut = await generateRecommendations(normalized);
    geminiMs = Date.now() - tGem;
  } catch (e) {
    if (e instanceof Error && /validation|non-JSON|Missing GEMINI/i.test(e.message)) {
      throw new NonRetryablePipelineError(e.message, { cause: e });
    }
    throw e;
  }

  const snap: CachedPipelineSnapshot = {
    pageSpeed,
    parsed,
    normalized,
    geoScore,
    gemini: geminiOut,
  };
  await writeFullCache(url, snap);

  const result = buildResultFromPipeline({
    url,
    context,
    pageSpeed,
    parsed,
    normalized,
    geoScore,
    gemini: geminiOut,
    fromCache: false,
  });

  logger.info("pipeline_url_completed", {
    url,
    pageSpeedMs,
    scrapeMs,
    geminiMs,
    totalMs: Date.now() - pipelineT0,
  });

  return result;
}

export async function processJob(payload: AnalyzeJobPayload): Promise<void> {
  if (payload.kind === "sitemap") {
    await processSitemapJob(payload);
    return;
  }
  await processSingleUrlJob(payload);
}

async function processSingleUrlJob(payload: Extract<AnalyzeJobPayload, { kind: "single" }>): Promise<void> {
  const { jobId, url, context } = payload;

  await jobStore.updateJobStatus(jobId, "processing");

  const result = await runFullPipelineForUrl({
    url,
    context,
    skipPipelineCache: payload.skipPipelineCache,
  });

  await jobStore.setJobResult(jobId, result);
  logger.info("job_completed", { jobId, url, cached: result.meta.cached });
}

async function processSitemapJob(payload: Extract<AnalyzeJobPayload, { kind: "sitemap" }>): Promise<void> {
  const { jobId, sitemapUrl, context } = payload;

  await jobStore.updateJobStatus(jobId, "processing");

  const serverMaxPages = envClampedInt("SITEMAP_MAX_PAGES", 200, 1, 500);
  const requested =
    typeof payload.maxPages === "number" && Number.isFinite(payload.maxPages)
      ? Math.floor(payload.maxPages)
      : serverMaxPages;
  const maxPages = Math.min(Math.max(1, requested), serverMaxPages);
  const maxSitemapDocuments = envClampedInt("SITEMAP_MAX_SITEMAP_DOCS", 40, 1, 500);
  /** Serial default avoids PageSpeed/Gemini rate limits; raise carefully. */
  const concurrency = envClampedInt("SITEMAP_PIPELINE_CONCURRENCY", 1, 1, 8);

  let collected;
  try {
    collected = await collectPageUrlsFromSitemap(sitemapUrl, {
      maxPages,
      maxSitemapDocuments,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new NonRetryablePipelineError(`Sitemap fetch failed: ${msg}`, { cause: e });
  }

  const urls = collected.urls;
  const pages: SitemapPageEntry[] = new Array(urls.length);
  let nextIndex = 0;

  async function pipelineWorker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      const pageUrl = urls[i]!;
      try {
        const result = await runFullPipelineForUrl({
          url: pageUrl,
          context,
          skipPipelineCache: payload.skipPipelineCache,
        });
        pages[i] = { url: pageUrl, ok: true, result };
      } catch (e) {
        pages[i] = {
          url: pageUrl,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, () => pipelineWorker())
  );

  let missingTitle = 0;
  let missingMetaDescription = 0;
  let missingH1 = 0;
  let pipelineFailures = 0;
  let pagesWithIssues = 0;
  const seoScores: number[] = [];

  for (const row of pages) {
    if (!row.ok) {
      pipelineFailures += 1;
      pagesWithIssues += 1;
      continue;
    }
    const parsed = row.result.normalized.parsed;
    if (parsed.missing.includes("title")) missingTitle += 1;
    if (parsed.missing.includes("meta_description")) missingMetaDescription += 1;
    if (parsed.missing.includes("h1")) missingH1 += 1;
    if (parsed.missing.length > 0) pagesWithIssues += 1;
    if (row.result.seoScore !== null) seoScores.push(row.result.seoScore);
  }

  const averageSeoScore =
    seoScores.length > 0 ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length) : null;

  const report: SitemapCrawlReport = {
    kind: "sitemap_report",
    sitemapUrl,
    context,
    urlsFromSitemap: urls.length,
    crawledCount: pages.length,
    truncated: collected.truncated,
    sitemapDocumentsFetched: collected.sitemapDocumentsFetched,
    summary: {
      missingTitle,
      missingMetaDescription,
      missingH1,
      pagesWithIssues,
      pipelineFailures,
      averageSeoScore,
    },
    pages,
    meta: {
      completedAt: new Date().toISOString(),
    },
  };

  await jobStore.setJobResult(jobId, report);
  logger.info("sitemap_job_completed", {
    jobId,
    sitemapUrl,
    urls: urls.length,
    truncated: collected.truncated,
    concurrency,
    pipelineFailures,
  });
}
