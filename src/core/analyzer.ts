import type { NormalizedSnapshot } from "../types/index.js";

export interface AnalysisSignals {
  criticalCount: number;
  summary: string;
}

export function analyzeSnapshot(snapshot: NormalizedSnapshot): AnalysisSignals {
  const critical = snapshot.issues.filter(
    (i) => i.startsWith("Missing") || i.includes("hreflang") || i.includes("below 80")
  );
  return {
    criticalCount: critical.length,
    summary: `Detected ${snapshot.issues.length} issue signals across metadata, GEO signals, and Lighthouse audits.`,
  };
}
