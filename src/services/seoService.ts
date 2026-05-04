import axios from "axios";
import http from "node:http";
import https from "node:https";
import type { PageSpeedSeoAuditRow, PageSpeedSeoSummary } from "../types/index.js";
import { envClampedFloat, envClampedInt, httpTimeoutMs } from "../utils/httpTimeouts.js";
import { logger } from "../utils/logger.js";

const PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** First attempt: Lighthouse often needs well over 60s for heavy URLs. */
const TIMEOUT_BASE_MS = httpTimeoutMs("PAGESPEED_TIMEOUT_MS", 180_000, 5000);
/** Per-request cap; each retry can use a longer timeout up to this ceiling. */
const TIMEOUT_MAX_MS = Math.max(
  TIMEOUT_BASE_MS,
  envClampedInt("PAGESPEED_TIMEOUT_MAX_MS", 300_000, 5000, 600_000)
);
/** Each retry multiplies the read timeout (helps ECONNABORTED; pairs with backoff for ECONNRESET). */
const TIMEOUT_RETRY_MULTIPLIER = envClampedFloat("PAGESPEED_TIMEOUT_RETRY_MULTIPLIER", 1.35, 1, 2.5);

/** Fresh TCP per request avoids stale keep-alive sockets that often surface as ECONNRESET to Google. */
const pagespeedHttpAgent = new http.Agent({ keepAlive: false });
const pagespeedHttpsAgent = new https.Agent({ keepAlive: false });

const MAX_HTTP_ATTEMPTS = envClampedInt("PAGESPEED_HTTP_MAX_ATTEMPTS", 5, 1, 10);
const RETRY_BASE_MS = envClampedInt("PAGESPEED_HTTP_RETRY_BASE_MS", 1000, 100, 60_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutMsForAttempt(attempt: number): number {
  const scaled = Math.round(TIMEOUT_BASE_MS * Math.pow(TIMEOUT_RETRY_MULTIPLIER, attempt));
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_BASE_MS, scaled));
}

/** Exponential backoff with jitter so parallel workers do not realign on Google. */
function backoffDelayMs(attempt: number): number {
  const exp = RETRY_BASE_MS * 2 ** attempt;
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(exp * jitter);
}

/** Axios threw or we treat HTTP 429 / 5xx as retryable at the transport layer. */
function isTransientPageSpeedFailure(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (err.response) {
    const s = err.response.status;
    return s === 429 || s >= 500;
  }
  const code = err.code;
  return (
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED"
  );
}

type RawLhAudit = {
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
};

function buildSeoAuditRow(raw: RawLhAudit): PageSpeedSeoAuditRow {
  const { title, description } = raw;
  const mode = raw.scoreDisplayMode ?? "";

  if (mode === "notApplicable") {
    return {
      title,
      description,
      scoreDisplayMode: mode,
      lighthouseScore: typeof raw.score === "number" ? raw.score : null,
      outcome: "not_applicable",
      outcomeLabel: "Not applicable for this page",
    };
  }

  if (mode === "manual") {
    return {
      title,
      description,
      scoreDisplayMode: mode,
      lighthouseScore: typeof raw.score === "number" ? raw.score : null,
      outcome: "informational",
      outcomeLabel: "Manual / policy check",
    };
  }

  if (mode === "informative") {
    return {
      title,
      description,
      scoreDisplayMode: mode,
      lighthouseScore: typeof raw.score === "number" ? raw.score : null,
      outcome: "informational",
      outcomeLabel: "Informational (not a pass/fail score)",
    };
  }

  if (mode === "error") {
    return {
      title,
      description,
      scoreDisplayMode: mode,
      lighthouseScore: null,
      outcome: "error",
      outcomeLabel: "Audit did not complete",
    };
  }

  if (typeof raw.score !== "number") {
    return {
      title,
      description,
      scoreDisplayMode: mode || undefined,
      lighthouseScore: null,
      outcome: "not_applicable",
      outcomeLabel: "No score returned",
    };
  }

  const pct = Math.round(raw.score * 100);

  if (mode === "binary") {
    if (raw.score >= 0.9) {
      return {
        title,
        description,
        scoreDisplayMode: mode,
        lighthouseScore: raw.score,
        outcome: "pass",
        outcomeLabel: "Pass",
      };
    }
    return {
      title,
      description,
      scoreDisplayMode: mode,
      lighthouseScore: raw.score,
      outcome: "fail",
      outcomeLabel: "Fail — address this check",
    };
  }

  if (raw.score >= 0.9) {
    return {
      title,
      description,
      scoreDisplayMode: mode || "numeric",
      lighthouseScore: raw.score,
      outcome: "pass",
      outcomeLabel: `Strong (${pct}/100)`,
    };
  }
  if (raw.score >= 0.45) {
    return {
      title,
      description,
      scoreDisplayMode: mode || "numeric",
      lighthouseScore: raw.score,
      outcome: "fail",
      outcomeLabel: `Needs improvement (${pct}/100)`,
    };
  }
  return {
    title,
    description,
    scoreDisplayMode: mode || "numeric",
    lighthouseScore: raw.score,
    outcome: "fail",
    outcomeLabel: `Poor (${pct}/100)`,
  };
}

function parsePageSpeedBody(data: unknown, url: string): PageSpeedSeoSummary {
  const payload = data as {
    lighthouseResult?: {
      categories?: {
        seo?: {
          score?: number | null;
          auditRefs?: { id?: string }[];
        };
      };
      audits?: Record<string, RawLhAudit>;
    };
  };

  const lh = payload.lighthouseResult;
  const seoCategory = lh?.categories?.seo;
  const rawCat = typeof seoCategory?.score === "number" ? seoCategory.score : null;
  const categoryScore = rawCat !== null ? Math.round(rawCat * 100) : null;

  const auditsRaw = lh?.audits ?? {};
  const refIds =
    seoCategory?.auditRefs?.map((r) => r.id).filter((id): id is string => Boolean(id)) ?? null;
  const auditIds =
    refIds && refIds.length > 0
      ? refIds
      : Object.keys(auditsRaw)
          .sort()
          .slice(0, 100);
  if (!refIds?.length) {
    logger.debug("pagespeed_seo_auditrefs_missing", { url, fallbackAuditCount: auditIds.length });
  }

  const audits: PageSpeedSeoSummary["audits"] = {};
  const rollup = {
    total: 0,
    passed: 0,
    failed: 0,
    notApplicable: 0,
    informational: 0,
    errors: 0,
  };

  for (const id of auditIds) {
    const raw = auditsRaw[id];
    if (!raw) continue;
    const row = buildSeoAuditRow(raw);
    audits[id] = row;
    rollup.total += 1;
    if (row.outcome === "pass") rollup.passed += 1;
    else if (row.outcome === "fail") rollup.failed += 1;
    else if (row.outcome === "not_applicable") rollup.notApplicable += 1;
    else if (row.outcome === "informational") rollup.informational += 1;
    else if (row.outcome === "error") rollup.errors += 1;
  }

  const categorySummary =
    categoryScore === null
      ? "Lighthouse did not return an overall SEO category score for this run."
      : rollup.total === 0
        ? `Overall Lighthouse SEO score is ${categoryScore}/100 (weighted category grade from Google). No per-check rows were included in this response.`
        : `Overall Lighthouse SEO score is ${categoryScore}/100. That value is a weighted category grade from Google — it is not the average of the per-check rows below. In this SEO slice: ${rollup.passed} passed, ${rollup.failed} failed, ${rollup.notApplicable} not applicable, ${rollup.informational} informational.`;

  logger.debug("pagespeed_fetched", { url, categoryScore });

  return {
    categoryScore,
    rawCategoryScore: rawCat,
    categorySummary,
    auditRollup: rollup,
    audits,
  };
}

export async function fetchPageSpeedSeo(url: string): Promise<PageSpeedSeoSummary> {
  const key = process.env.PAGESPEED_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("Missing PAGESPEED_API_KEY or GOOGLE_API_KEY");
  }

  const clientStartedAt = Date.now();
  let lastFailure: unknown;

  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt++) {
    const timeoutMs = timeoutMsForAttempt(attempt);
    logger.debug("pagespeed_attempt", {
      url,
      attempt: attempt + 1,
      maxAttempts: MAX_HTTP_ATTEMPTS,
      timeoutMs,
    });

    try {
      const response = await axios.get(PAGESPEED_URL, {
        params: {
          url,
          key,
          category: "SEO",
        },
        timeout: timeoutMs,
        validateStatus: () => true,
        httpAgent: pagespeedHttpAgent,
        httpsAgent: pagespeedHttpsAgent,
      });

      if (response.status < 400) {
        const summary = parsePageSpeedBody(response.data, url);
        logger.info("pagespeed_client_done", {
          url,
          clientDurationMs: Date.now() - clientStartedAt,
          httpAttempts: attempt + 1,
        });
        return summary;
      }

      if (response.status === 429 || response.status >= 500) {
        lastFailure = Object.assign(new Error(`PageSpeed API error: HTTP ${response.status}`), {
          status: response.status,
        });
        if (attempt < MAX_HTTP_ATTEMPTS - 1) {
          const wait = backoffDelayMs(attempt);
          const nextTimeout = timeoutMsForAttempt(attempt + 1);
          logger.warn("pagespeed_retry", {
            url,
            reason: "http_status",
            status: response.status,
            attempt: attempt + 1,
            maxAttempts: MAX_HTTP_ATTEMPTS,
            nextDelayMs: wait,
            nextTimeoutMs: nextTimeout,
          });
          await sleep(wait);
        }
        continue;
      }

      const err = new Error(`PageSpeed API error: HTTP ${response.status}`);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    } catch (e) {
      if (!isTransientPageSpeedFailure(e)) {
        throw e;
      }
      lastFailure = e;
      if (attempt < MAX_HTTP_ATTEMPTS - 1) {
        const wait = backoffDelayMs(attempt);
        const nextTimeout = timeoutMsForAttempt(attempt + 1);
        const code = axios.isAxiosError(e) ? e.code : undefined;
        const status = axios.isAxiosError(e) ? e.response?.status : undefined;
        logger.warn("pagespeed_retry", {
          url,
          reason: "network",
          code,
          status,
          attempt: attempt + 1,
          maxAttempts: MAX_HTTP_ATTEMPTS,
          usedTimeoutMs: timeoutMs,
          nextDelayMs: wait,
          nextTimeoutMs: nextTimeout,
        });
        await sleep(wait);
      }
    }
  }

  if (lastFailure instanceof Error) {
    throw lastFailure;
  }
  throw new Error("PageSpeed request failed after retries");
}
