import axios from "axios";
import * as cheerio from "cheerio";
import { httpTimeoutMs } from "../utils/httpTimeouts.js";
import { logger } from "../utils/logger.js";

const TIMEOUT_MS = httpTimeoutMs("SITEMAP_FETCH_TIMEOUT_MS", 30_000);

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function fetchSitemapXml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: TIMEOUT_MS,
    responseType: "text",
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SEO-GEO-Analyzer/1.0; +https://example.invalid/bot)",
      Accept: "application/xml,text/xml,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return response.data;
}

/** Parse standard sitemap / sitemap index: classify `<loc>` by parent tag (`url` vs `sitemap`). */
export function parseSitemapLocs(xml: string): { pageUrls: string[]; nestedSitemaps: string[] } {
  const $ = cheerio.load(xml, { xml: true });
  const pageUrls: string[] = [];
  const nestedSitemaps: string[] = [];

  $("loc").each((_, el) => {
    const text = $(el).text().trim();
    if (!text || !isHttpUrl(text)) return;
    const parent = $(el).parent().prop("tagName")?.toLowerCase() ?? "";
    if (parent === "sitemap") nestedSitemaps.push(text);
    else if (parent === "url") pageUrls.push(text);
  });

  return { pageUrls, nestedSitemaps };
}

export interface CollectSitemapUrlsOptions {
  maxPages: number;
  maxSitemapDocuments: number;
}

export interface CollectSitemapUrlsResult {
  urls: string[];
  truncated: boolean;
  sitemapDocumentsFetched: number;
}

/**
 * Walk sitemap index files (BFS), collect page URLs until `maxPages` or `maxSitemapDocuments`.
 */
export async function collectPageUrlsFromSitemap(
  seedSitemapUrl: string,
  options: CollectSitemapUrlsOptions
): Promise<CollectSitemapUrlsResult> {
  const seenSitemaps = new Set<string>();
  const seenPages = new Set<string>();
  const queue: string[] = [seedSitemapUrl.trim()];
  const pageUrls: string[] = [];
  let sitemapDocumentsFetched = 0;
  let truncated = false;

  while (
    queue.length > 0 &&
    pageUrls.length < options.maxPages &&
    sitemapDocumentsFetched < options.maxSitemapDocuments
  ) {
    const smUrl = queue.shift()!;
    const key = smUrl.trim().toLowerCase();
    if (seenSitemaps.has(key)) continue;
    seenSitemaps.add(key);

    const xml = await fetchSitemapXml(smUrl);
    sitemapDocumentsFetched += 1;

    const { pageUrls: pages, nestedSitemaps } = parseSitemapLocs(xml);

    for (const n of nestedSitemaps) {
      const nk = n.trim().toLowerCase();
      if (!seenSitemaps.has(nk)) queue.push(n.trim());
    }

    for (const p of pages) {
      const pk = p.trim().toLowerCase();
      if (seenPages.has(pk)) continue;
      seenPages.add(pk);
      pageUrls.push(p.trim());
      if (pageUrls.length >= options.maxPages) {
        truncated = true;
        break;
      }
    }
  }

  if (!truncated && queue.length > 0 && pageUrls.length >= options.maxPages) truncated = true;

  logger.info("sitemap_collect_done", {
    seedSitemapUrl,
    pageCount: pageUrls.length,
    truncated,
    sitemapDocumentsFetched,
  });

  return { urls: pageUrls, truncated, sitemapDocumentsFetched };
}
