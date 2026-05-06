import "dotenv/config";
import { buildApp } from "./app.js";
import { logger } from "../utils/logger.js";
import { closeRedis } from "../storage/redisClient.js";

async function main(): Promise<void> {
  const app = await buildApp();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
  logger.info("api_listening", { port, host });

  const shutdown = async () => {
    logger.info("api_shutdown");
    await app.close();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((err) => {
  logger.error("api_fatal", { err: String(err) });
  process.exit(1);
});
