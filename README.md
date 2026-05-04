# whats-your-status

Asynchronous SEO + GEO analysis API. Jobs are queued with **BullMQ**, processed by a **worker**, with state and caching in **Redis**.

## Prerequisites

- **Node.js 18+**
- **Redis** running (default: `redis://127.0.0.1:6379`)

## Setup

```bash
npm install
npm run build
```

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Or create a **`.env`** file in the project root (same folder as `package.json`):

```env
# Redis (optional if using local default)
REDIS_URL=redis://127.0.0.1:6379

# PageSpeed Insights — use one of these
PAGESPEED_API_KEY=your_google_api_key
# GOOGLE_API_KEY=your_google_api_key

# Gemini
GEMINI_API_KEY=your_gemini_api_key

# API (optional)
PORT=3000
HOST=0.0.0.0

# Optional: more verbose logs
# LOG_LEVEL=debug
```

- **PageSpeed:** create a key in [Google Cloud Console](https://console.cloud.google.com/) with the PageSpeed Insights API enabled, or use an API key that has access to the PageSpeed Online API.
- **Gemini:** key from [Google AI Studio](https://aistudio.google.com/apikey).

## How to run

You need **two processes**: the HTTP API and the worker.

### Production-style (compiled)

**Terminal 1 — API**

```bash
npm run start:api
```

**Terminal 2 — worker**

```bash
npm run start:worker
```

The API listens on **`http://0.0.0.0:3000`** by default (or `PORT` / `HOST` from `.env`).

### Development (auto-reload on file changes)

**Terminal 1**

```bash
npm run dev:api
```

**Terminal 2**

```bash
npm run dev:worker
```

`dotenv` loads `.env` automatically for both the API and the worker.

## Try the API

**Enqueue an analysis**

```bash
curl -s -X POST http://127.0.0.1:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","context":"US English"}'
```

Response includes `jobId` and `status: "queued"`.

**Check status**

```bash
curl -s http://127.0.0.1:3000/status/<jobId>
```

**Get result (when completed)**

```bash
curl -s http://127.0.0.1:3000/result/<jobId>
```

While the job is still running you may get **202** with a “not ready” style payload; when finished you get **200** with the full `result` or an `error` if the job failed.

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| Jobs stay `queued` | Worker not running, or Redis URL mismatch between API and worker. |
| `Missing PAGESPEED_API_KEY or GOOGLE_API_KEY` | Set `PAGESPEED_API_KEY` or `GOOGLE_API_KEY` in `.env` and restart **both** API and worker. |
| `Missing GEMINI_API_KEY` | Set `GEMINI_API_KEY` and restart the worker. |
| Port in use | Change `PORT` in `.env` or stop the process using that port. |

## Scripts reference

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run start:api` | Run compiled API server. |
| `npm run start:worker` | Run compiled BullMQ worker. |
| `npm run dev:api` | Run API with `tsx watch`. |
| `npm run dev:worker` | Run worker with `tsx watch`. |
