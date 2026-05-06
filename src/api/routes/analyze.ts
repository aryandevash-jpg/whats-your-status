import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { enqueueAnalysis } from "../../queue/queue.js";
import * as jobStore from "../../storage/jobStore.js";
import type { AnalyzeRequestBody } from "../../types/index.js";
import { isValidHttpUrl } from "../../utils/httpUrl.js";
import { logger } from "../../utils/logger.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.post<{ Body: AnalyzeRequestBody }>("/analyze", async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.url !== "string" || !body.url.trim()) {
      return reply.status(400).send({ error: "Invalid input", details: "url is required" });
    }
    const url = body.url.trim();
    if (!isValidHttpUrl(url)) {
      return reply.status(400).send({ error: "Invalid input", details: "url must be http(s)" });
    }

    const jobId = randomUUID();
    await jobStore.createJob(jobId);
    const skipPipelineCache = body.skipPipelineCache === true;
    await enqueueAnalysis({
      jobId,
      url,
      context: typeof body.context === "string" ? body.context : undefined,
      skipPipelineCache,
    });

    logger.info("analyze_enqueued", { jobId, url, skipPipelineCache });

    return reply.status(202).send({
      jobId,
      status: "queued" as const,
    });
  });
};

export default plugin;
