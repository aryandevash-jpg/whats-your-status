import Redis from "ioredis";
import { getRedisUrl } from "./redisClient.js";

export function createBullConnection(): Redis {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
