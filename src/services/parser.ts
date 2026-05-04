import * as cheerio from "cheerio";
import type { ParsedPageMeta } from "../types/index.js";

export function parseHtml(html: string): ParsedPageMeta {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h2 = $("h2")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h3 = $("h3")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const hreflangLinks: ParsedPageMeta["hreflangLinks"] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hreflang = $(el).attr("hreflang")?.trim();
    const href = $(el).attr("href")?.trim();
    if (hreflang && href) hreflangLinks.push({ hreflang, href });
  });

  const htmlLang = $("html").attr("lang")?.trim() || null;

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!metaDescription) missing.push("meta_description");
  if (h1.length === 0) missing.push("h1");

  return {
    title,
    metaDescription,
    h1,
    h2,
    h3,
    missing,
    hreflangLinks,
    htmlLang,
  };
}
