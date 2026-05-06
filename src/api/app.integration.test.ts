import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import type { JobRecord } from "../types/index.js";
import { buildApp } from "./app.js";
import * as jobStore from "../storage/jobStore.js";
import * as queue from "../queue/queue.js";

jest.mock("../utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../queue/queue.js", () => ({
  enqueueAnalysis: jest.fn(async () => {}),
  analysisQueue: {},
  QUEUE_NAME: "seo-geo-analyze",
}));

jest.mock("../storage/jobStore.js", () => ({
  createJob: jest.fn(),
  getJob: jest.fn(),
  updateJobStatus: jest.fn(),
  setJobResult: jest.fn(),
  setJobFailed: jest.fn(),
}));

const mockedCreateJob = jobStore.createJob as jest.MockedFunction<typeof jobStore.createJob>;
const mockedGetJob = jobStore.getJob as jest.MockedFunction<typeof jobStore.getJob>;
const mockedEnqueue = queue.enqueueAnalysis as jest.MockedFunction<typeof queue.enqueueAnalysis>;

describe("API (integration)", () => {
  const appPromise = buildApp();
  let server: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    server = await appPromise;
    await server.ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /health", () => {
    it("returns 200", async () => {
      const res = await request(server.server).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("POST /analyze", () => {
    it("returns 202 and enqueues when url is valid", async () => {
      mockedCreateJob.mockImplementation(async (jobId: string) => ({
        jobId,
        status: "queued",
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }));

      const res = await request(server.server).post("/analyze").send({
        url: "https://example.com",
      });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe("queued");
      expect(mockedEnqueue).toHaveBeenCalledTimes(1);
      expect(mockedEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "single",
          url: "https://example.com",
        })
      );
      expect(mockedCreateJob).toHaveBeenCalledWith(res.body.jobId);
    });

    it("returns 400 when url is missing or invalid", async () => {
      const empty = await request(server.server).post("/analyze").send({});
      expect(empty.status).toBe(400);

      const bad = await request(server.server).post("/analyze").send({
        url: "not-a-valid-url",
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("POST /sitemap-analyze", () => {
    it("returns 202 and enqueues sitemap job when sitemapUrl is valid", async () => {
      mockedCreateJob.mockImplementation(async (jobId: string) => ({
        jobId,
        status: "queued",
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }));

      const res = await request(server.server).post("/sitemap-analyze").send({
        sitemapUrl: "https://example.com/sitemap.xml",
        maxPages: 50,
      });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe("queued");
      expect(mockedEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "sitemap",
          sitemapUrl: "https://example.com/sitemap.xml",
          maxPages: 50,
          skipPipelineCache: false,
        })
      );
    });

    it("passes skipPipelineCache when requested", async () => {
      mockedCreateJob.mockImplementation(async (jobId: string) => ({
        jobId,
        status: "queued",
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }));

      const res = await request(server.server).post("/sitemap-analyze").send({
        sitemapUrl: "https://example.com/sitemap.xml",
        skipPipelineCache: true,
      });

      expect(res.status).toBe(202);
      expect(mockedEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "sitemap",
          skipPipelineCache: true,
        })
      );
    });

    it("returns 400 when sitemapUrl is missing or invalid", async () => {
      const empty = await request(server.server).post("/sitemap-analyze").send({});
      expect(empty.status).toBe(400);

      const bad = await request(server.server).post("/sitemap-analyze").send({
        sitemapUrl: "not-a-url",
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("GET /status/:jobId", () => {
    it("returns 404 when job is missing", async () => {
      mockedGetJob.mockResolvedValueOnce(null);

      const res = await request(server.server).get("/status/missing-job-id");

      expect(res.status).toBe(404);
    });

    it("returns job metadata when present", async () => {
      const record: JobRecord = {
        jobId: "j1",
        status: "processing",
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      mockedGetJob.mockResolvedValueOnce(record);

      const res = await request(server.server).get("/status/j1");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        jobId: "j1",
        status: "processing",
      });
    });
  });

  describe("GET /result/:jobId", () => {
    it("returns 404 when job is missing", async () => {
      mockedGetJob.mockResolvedValueOnce(null);

      const res = await request(server.server).get("/result/missing");

      expect(res.status).toBe(404);
    });

    it("returns 202 when job is still in progress", async () => {
      mockedGetJob.mockResolvedValueOnce({
        jobId: "j2",
        status: "queued",
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const res = await request(server.server).get("/result/j2");

      expect(res.status).toBe(202);
      expect(res.body.message).toBeDefined();
    });
  });
});
