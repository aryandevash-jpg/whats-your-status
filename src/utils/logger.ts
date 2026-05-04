type Level = "info" | "warn" | "error" | "debug";

function format(level: Level, message: string, meta?: Record<string, unknown>): string {
  const base = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  return base;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(format("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(format("error", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(format("debug", message, meta));
    }
  },
};
