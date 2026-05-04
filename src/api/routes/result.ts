import type { FastifyPluginAsync } from "fastify";
import * as jobStore from "../../storage/jobStore.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { jobId: string } }>("/result/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    if (!jobId) {
      return reply.status(400).send({ error: "Missing jobId" });
    }
    const job = await jobStore.getJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: "Job not found", jobId });
    }

    if (job.status === "completed" && job.result) {
      return reply.send({
        jobId: job.jobId,
        status: job.status,
        result: job.result,
      });
    }

    if (job.status === "failed") {
      return reply.status(200).send({
        jobId: job.jobId,
        status: job.status,
        error: job.error,
      });
    }

    return reply.status(202).send({
      jobId: job.jobId,
      status: job.status,
      message: "Result not ready yet",
    });
  });
};

export default plugin;
