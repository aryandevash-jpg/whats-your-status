import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import analyzeRoutes from "./routes/analyze.js";
import sitemapAnalyzeRoutes from "./routes/sitemapAnalyze.js";
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
  await app.register(sitemapAnalyzeRoutes);
  await app.register(statusRoutes);
  await app.register(resultRoutes);

  const distCandidates = [
    process.env.FRONTEND_DIST_DIR,
    resolve(process.cwd(), "web-dist"),
    resolve(process.cwd(), "web/dist"),
  ].filter((p): p is string => Boolean(p));
  const frontendRoot = distCandidates.find((p) => existsSync(p));
  if (frontendRoot) {
    await app.register(fastifyStatic, {
      root: frontendRoot,
      prefix: "/",
      wildcard: false,
      index: ["index.html"],
    });

    app.get("/*", async (request, reply) => {
      // Keep API and health routes distinct; everything else serves SPA entrypoint.
      if (
        request.url.startsWith("/analyze") ||
        request.url.startsWith("/sitemap-analyze") ||
        request.url.startsWith("/status/") ||
        request.url.startsWith("/result/") ||
        request.url === "/health"
      ) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((err, request, reply) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("http_error", { err: message, url: request.url });
    return reply.status(500).send({ error: "Internal server error" });
  });

  return app;
}
