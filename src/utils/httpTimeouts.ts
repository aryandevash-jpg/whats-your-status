/** Outbound HTTP/client timeouts from env, with a safe fallback. */
export function httpTimeoutMs(envName: string, fallback: number, minMs = 1000): number {
  const raw = process.env[envName];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= minMs ? n : fallback;
}

/** Positive integer from env, clamped to [min, max]. */
export function envClampedInt(envName: string, fallback: number, min: number, max: number): number {
  const raw = process.env[envName];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function envClampedFloat(envName: string, fallback: number, min: number, max: number): number {
  const raw = process.env[envName];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
