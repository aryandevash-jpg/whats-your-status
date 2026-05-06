import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { enqueueAnalysis } from "../../queue/queue.js";
import * as jobStore from "../../storage/jobStore.js";
import type { SitemapAnalyzeRequestBody } from "../../types/index.js";
import { isValidHttpUrl } from "../../utils/httpUrl.js";
import { logger } from "../../utils/logger.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: SitemapAnalyzeRequestBody }>("/sitemap-analyze", async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.sitemapUrl !== "string" || !body.sitemapUrl.trim()) {
      return reply.status(400).send({ error: "Invalid input", details: "sitemapUrl is required" });
    }
    const sitemapUrl = body.sitemapUrl.trim();
    if (!isValidHttpUrl(sitemapUrl)) {
      return reply.status(400).send({ error: "Invalid input", details: "sitemapUrl must be http(s)" });
    }

    const jobId = randomUUID();
    await jobStore.createJob(jobId);

    const maxPages =
      typeof body.maxPages === "number" && Number.isFinite(body.maxPages)
        ? Math.floor(body.maxPages)
        : undefined;
    const skipPipelineCache = body.skipPipelineCache === true;

    await enqueueAnalysis({
      kind: "sitemap",
      jobId,
      sitemapUrl,
      context: typeof body.context === "string" ? body.context : undefined,
      maxPages,
      skipPipelineCache,
    });

    logger.info("sitemap_analyze_enqueued", { jobId, sitemapUrl, maxPages, skipPipelineCache });

    return reply.status(202).send({
      jobId,
      status: "queued" as const,
    });
  });
};

export default plugin;
