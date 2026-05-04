import "dotenv/config";
import Fastify from "fastify";
import analyzeRoutes from "./routes/analyze.js";
import statusRoutes from "./routes/status.js";
import resultRoutes from "./routes/result.js";
import { logger } from "../utils/logger.js";
import { closeRedis } from "../storage/redisClient.js";

async function main(): Promise<void> {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true,
  });

  await app.register(analyzeRoutes);
  await app.register(statusRoutes);
  await app.register(resultRoutes);

  app.setErrorHandler((err, request, reply) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("http_error", { err: message, url: request.url });
    return reply.status(500).send({ error: "Internal server error" });
  });

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
