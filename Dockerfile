# syntax=docker/dockerfile:1
# One image: API (default) and worker share dist/ + dependencies. Run the worker with:
#   docker run ... your-image node dist/queue/worker.js
# In ECS, override the container command for the worker.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY web/package.json web/package-lock.json ./web/
COPY src ./src
COPY web ./web
RUN npm ci && npm run build && npm ci --prefix web && npm run build --prefix web

FROM node:22-bookworm-slim
RUN groupadd --system --gid 1001 appgroup \
  && useradd --system --uid 1001 -g appgroup -m -d /app appuser \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web-dist
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# API; use `node dist/queue/worker.js` for the BullMQ worker (same image).
CMD ["node", "dist/api/server.js"]
