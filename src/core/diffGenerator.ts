import type { DiffBundle, GeminiStructuredOutput, JsonPatchOperation, ParsedPageMeta } from "../types/index.js";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

export function buildJsonPatchFromMeta(
  current: { title: string | null; description: string | null },
  next: GeminiStructuredOutput["meta_updates"]
): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  const curTitle = current.title ?? "";
  const curDesc = current.description ?? "";
  if (curTitle !== next.title) {
    ops.push({ op: "replace", path: "/head/title", value: next.title });
  }
  if (curDesc !== next.description) {
    ops.push({ op: "replace", path: "/head/meta/description", value: next.description });
  }
  return ops;
}

export function buildGitStyleDiffForChanges(
  gemini: GeminiStructuredOutput,
  parsed: ParsedPageMeta
): string {
  const blocks: string[] = [];
  const metaBlock = unifiedDiff(
    "index.html",
    buildApproxHeadSnippet(parsed),
    buildProposedHeadSnippet(gemini)
  );
  blocks.push(metaBlock);

  for (const change of gemini.code_changes) {
    blocks.push(unifiedDiff(change.file, change.before || "", change.after));
  }
  return blocks.filter(Boolean).join("\n\n");
}

function buildApproxHeadSnippet(parsed: ParsedPageMeta): string {
  const title = parsed.title ?? "";
  const desc = parsed.metaDescription ?? "";
  return [
    "<head>",
    `  <title>${escapeXmlText(title)}</title>`,
    `  <meta name="description" content="${escapeXmlAttr(desc)}" />`,
    "</head>",
  ].join("\n");
}

function buildProposedHeadSnippet(gemini: GeminiStructuredOutput): string {
  return [
    "<head>",
    `  <title>${escapeXmlText(gemini.meta_updates.title)}</title>`,
    `  <meta name="description" content="${escapeXmlAttr(gemini.meta_updates.description)}" />`,
    "</head>",
  ].join("\n");
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unifiedDiff(filename: string, before: string, after: string): string {
  const aLines = before.split("\n");
  const bLines = after.split("\n");
  const header = `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n`;
  if (stableStringify(before) === stableStringify(after)) return "";
  const body = simpleUnifiedBody(aLines, bLines);
  return header + body;
}

function simpleUnifiedBody(a: string[], b: string[]): string {
  const hunk: string[] = ["@@", ...a.map((l) => "-" + l), ...b.map((l) => "+" + l)];
  return hunk.join("\n") + "\n";
}

export function buildJsonPatchFull(
  parsed: ParsedPageMeta,
  gemini: GeminiStructuredOutput
): JsonPatchOperation[] {
  const ops = buildJsonPatchFromMeta(
    { title: parsed.title, description: parsed.metaDescription },
    gemini.meta_updates
  );

  gemini.code_changes.forEach((c, idx) => {
    ops.push({
      op: "replace",
      path: `/code_changes/${idx}/file`,
      value: c.file,
    });
    ops.push({
      op: "replace",
      path: `/code_changes/${idx}/before`,
      value: c.before,
    });
    ops.push({
      op: "replace",
      path: `/code_changes/${idx}/after`,
      value: c.after,
    });
  });

  return ops;
}

export function buildDiffBundle(parsed: ParsedPageMeta, gemini: GeminiStructuredOutput): DiffBundle {
  return {
    jsonPatch: buildJsonPatchFull(parsed, gemini),
    gitStyleDiff: buildGitStyleDiffForChanges(gemini, parsed),
  };
}
