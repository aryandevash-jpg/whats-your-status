import type { FastifyPluginAsync } from "fastify";
import * as jobStore from "../../storage/jobStore.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { jobId: string } }>("/status/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    if (!jobId) {
      return reply.status(400).send({ error: "Missing jobId" });
    }
    const job = await jobStore.getJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: "Job not found", jobId });
    }

    return reply.send({
      jobId: job.jobId,
      status: job.status,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  });
};

export default plugin;
