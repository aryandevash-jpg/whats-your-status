import axios from "axios";
import type { PageSpeedSeoSummary } from "../types/index.js";
import { logger } from "../utils/logger.js";

const PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 8000;

export async function fetchPageSpeedSeo(url: string): Promise<PageSpeedSeoSummary> {
  const key = process.env.PAGESPEED_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("Missing PAGESPEED_API_KEY or GOOGLE_API_KEY");
  }

  const response = await axios.get(PAGESPEED_URL, {
    params: {
      url,
      key,
      category: "SEO",
    },
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const err = new Error(`PageSpeed API error: HTTP ${response.status}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  const data = response.data as {
    lighthouseResult?: {
      categories?: { seo?: { score?: number | null } };
      audits?: Record<string, { title?: string; description?: string; score?: number | null }>;
    };
  };

  const lh = data.lighthouseResult;
  const seoCategory = lh?.categories?.seo;
  const score =
    typeof seoCategory?.score === "number" ? Math.round(seoCategory.score * 100) : null;

  const auditsRaw = lh?.audits ?? {};
  const audits: PageSpeedSeoSummary["audits"] = {};
  for (const [id, audit] of Object.entries(auditsRaw)) {
    audits[id] = {
      title: audit.title,
      description: audit.description,
      score: typeof audit.score === "number" ? Math.round(audit.score * 100) : audit.score ?? null,
    };
  }

  logger.debug("pagespeed_fetched", { url, score });

  return {
    score,
    audits,
    rawCategoryScore: seoCategory?.score ?? null,
  };
}
