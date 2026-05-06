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
import type { AnalysisResult, AnalyzeJobPayload, CachedPipelineSnapshot } from "../types/index.js";
import { logger } from "../utils/logger.js";

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

export async function processJob(payload: AnalyzeJobPayload): Promise<void> {
  const { jobId, url, context } = payload;

  await jobStore.updateJobStatus(jobId, "processing");

  const fullCached = payload.skipPipelineCache ? null : await readFullCache(url);
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
    await jobStore.setJobResult(jobId, result);
    logger.info("job_completed_from_cache", { jobId, url });
    return;
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
  await jobStore.setJobResult(jobId, result);
  logger.info("job_completed", {
    jobId,
    url,
    pageSpeedMs,
    scrapeMs,
    geminiMs,
    totalMs: Date.now() - pipelineT0,
  });
}
