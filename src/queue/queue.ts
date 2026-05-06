import { Queue } from "bullmq";
import { createBullConnection } from "../storage/bullConnection.js";
import type { AnalyzeJobPayload } from "../types/index.js";

const QUEUE_NAME = "seo-geo-analyze";

const connection = createBullConnection();

export const analysisQueue = new Queue<AnalyzeJobPayload>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    // PageSpeed uses its own time-budgeted HTTP retries; avoid stacking BullMQ attempts (extra load, duplicate ECONNRESET).
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export { QUEUE_NAME };

export async function enqueueAnalysis(payload: AnalyzeJobPayload): Promise<void> {
  await analysisQueue.add("run", payload, {
    jobId: payload.jobId,
  });
}
