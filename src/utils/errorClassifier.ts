import axios, { AxiosError } from "axios";
import type { ErrorClass } from "../types/index.js";

export interface ClassifiedError {
  class: ErrorClass;
  message: string;
  code?: string;
  status?: number;
}

function isAxiosError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}

export function classifyError(err: unknown): ClassifiedError {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    const code = err.code;

    if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
      return { class: "retryable", message: err.message, code, status };
    }
    if (code === "ECONNRESET" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED") {
      return { class: "retryable", message: err.message, code, status };
    }
    if (status === 429) {
      return { class: "retryable", message: err.message, code, status };
    }
    if (status !== undefined && status >= 500) {
      return { class: "retryable", message: err.message, code, status };
    }
    return { class: "non_retryable", message: err.message, code, status };
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("socket") || msg.includes("timeout")) {
      return { class: "retryable", message: err.message };
    }
    return { class: "non_retryable", message: err.message };
  }

  return { class: "non_retryable", message: String(err) };
}

export function isRetryable(classified: ClassifiedError): boolean {
  return classified.class === "retryable";
}
