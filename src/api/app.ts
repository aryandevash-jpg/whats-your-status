import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import analyzeRoutes from "./routes/analyze.js";
import statusRoutes from "./routes/status.js";
import resultRoutes from "./routes/result.js";
import { logger } from "../utils/logger.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true,
  });

  const corsOrigins =
    process.env.CORS_ORIGIN?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? [];
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async (_request, reply) => reply.send({ status: "ok" }));

  await app.register(analyzeRoutes);
  await app.register(statusRoutes);
  await app.register(resultRoutes);

  app.setErrorHandler((err, request, reply) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("http_error", { err: message, url: request.url });
    return reply.status(500).send({ error: "Internal server error" });
  });

  return app;
}
