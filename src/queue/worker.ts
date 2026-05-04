import "dotenv/config";
import { Worker, UnrecoverableError } from "bullmq";
import { createBullConnection } from "../storage/bullConnection.js";
import { processJob, NonRetryablePipelineError } from "./jobProcessor.js";
import { QUEUE_NAME } from "./queue.js";
import type { AnalyzeJobPayload } from "../types/index.js";
import { classifyError, isRetryable } from "../utils/errorClassifier.js";
import { logger } from "../utils/logger.js";
import * as jobStore from "../storage/jobStore.js";

const connection = createBullConnection();

const worker = new Worker<AnalyzeJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const payload = job.data;
    try {
      await processJob(payload);
    } catch (err) {
      const classified = classifyError(err);
      if (err instanceof NonRetryablePipelineError) {
        logger.warn("job_non_retryable", { jobId: payload.jobId, message: err.message });
        await jobStore.setJobFailed(payload.jobId, err.message);
        throw new UnrecoverableError(err.message);
      }
      if (!isRetryable(classified)) {
        logger.warn("job_failed_no_retry", {
          jobId: payload.jobId,
          message: classified.message,
          status: classified.status,
        });
        await jobStore.setJobFailed(payload.jobId, classified.message);
        throw new UnrecoverableError(classified.message);
      }
      const attempt = job.attemptsMade + 1;
      logger.warn("job_retry_scheduled", {
        jobId: payload.jobId,
        attempt,
        message: classified.message,
        status: classified.status,
        code: classified.code,
      });
      throw err;
    }
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  if (!job?.data?.jobId) return;
  const max = job.opts.attempts ?? 3;
  if (job.attemptsMade >= max) {
    const existing = await jobStore.getJob(job.data.jobId);
    if (existing?.status !== "failed" && existing?.status !== "completed") {
      await jobStore.setJobFailed(job.data.jobId, err?.message ?? "Job failed after retries");
    }
  }
  logger.error("worker_job_failed", {
    jobId: job.data.jobId,
    err: err?.message ?? String(err),
    attemptsMade: job.attemptsMade,
    maxAttempts: max,
  });
});

worker.on("completed", (job) => {
  logger.info("worker_job_completed_event", { jobId: job.id });
});

logger.info("worker_started", { queue: QUEUE_NAME, redis: process.env.REDIS_URL ?? "default" });
