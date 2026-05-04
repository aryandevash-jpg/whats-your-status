import Redis from "ioredis";
import { logger } from "../utils/logger.js";

let shared: Redis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

export function getRedis(): Redis {
  if (!shared) {
    shared = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    shared.on("error", (err) => {
      logger.error("redis_client_error", { err: String(err) });
    });
  }
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = null;
  }
}
