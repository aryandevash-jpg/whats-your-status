import axios from "axios";
import { logger } from "../utils/logger.js";

const TIMEOUT_MS = 8000;

export interface ScrapeResult {
  html: string;
  finalUrl: string;
  headers: Record<string, string>;
}

export async function scrapeHtml(url: string): Promise<ScrapeResult> {
  const response = await axios.get<string>(url, {
    timeout: TIMEOUT_MS,
    responseType: "text",
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SEO-GEO-Analyzer/1.0; +https://example.invalid/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const finalUrl = response.request?.res?.responseUrl ?? url;
  const headers: Record<string, string> = {};
  const rawHeaders = response.headers as Record<string, string | string[] | undefined>;
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof v === "string") headers[k.toLowerCase()] = v;
    else if (Array.isArray(v) && v.length) headers[k.toLowerCase()] = v.join(", ");
  }

  logger.debug("scrape_ok", { url, finalUrl, bytes: response.data?.length ?? 0 });

  return {
    html: response.data,
    finalUrl,
    headers,
  };
}
