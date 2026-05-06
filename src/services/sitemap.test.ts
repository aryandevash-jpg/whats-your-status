import { describe, expect, it } from "@jest/globals";
import { parseSitemapLocs } from "./sitemap.js";

describe("parseSitemapLocs", () => {
  it("reads urlset entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
    const { pageUrls, nestedSitemaps } = parseSitemapLocs(xml);
    expect(nestedSitemaps).toEqual([]);
    expect(pageUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("reads sitemap index nested locs", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sub.xml</loc></sitemap>
</sitemapindex>`;
    const { pageUrls, nestedSitemaps } = parseSitemapLocs(xml);
    expect(pageUrls).toEqual([]);
    expect(nestedSitemaps).toEqual(["https://example.com/sub.xml"]);
  });
});
