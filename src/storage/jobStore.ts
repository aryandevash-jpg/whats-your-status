import { getRedis } from "./redisClient.js";
import type { JobRecord, JobResultPayload, JobStatus } from "../types/index.js";

const JOB_PREFIX = "job:";

function nowIso(): string {
  return new Date().toISOString();
}

export async function createJob(jobId: string): Promise<JobRecord> {
  const redis = getRedis();
  const createdAt = nowIso();
  const record: JobRecord = {
    jobId,
    status: "queued",
    result: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
  await redis.set(JOB_PREFIX + jobId, JSON.stringify(record));
  return record;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  patch?: Partial<Pick<JobRecord, "result" | "error">>
): Promise<JobRecord | null> {
  const redis = getRedis();
  const raw = await redis.get(JOB_PREFIX + jobId);
  if (!raw) return null;
  const existing = JSON.parse(raw) as JobRecord;
  const updated: JobRecord = {
    ...existing,
    status,
    updatedAt: nowIso(),
  };
  if (patch?.result !== undefined) updated.result = patch.result;
  if (patch?.error !== undefined) updated.error = patch.error;
  await redis.set(JOB_PREFIX + jobId, JSON.stringify(updated));
  return updated;
}

export async function setJobResult(jobId: string, result: JobResultPayload): Promise<JobRecord | null> {
  return updateJobStatus(jobId, "completed", { result, error: null });
}

export async function setJobFailed(jobId: string, errorMessage: string): Promise<JobRecord | null> {
  return updateJobStatus(jobId, "failed", { error: errorMessage, result: null });
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const redis = getRedis();
  const raw = await redis.get(JOB_PREFIX + jobId);
  if (!raw) return null;
  return JSON.parse(raw) as JobRecord;
}
