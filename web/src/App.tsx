import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  Globe2,
  LayoutList,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { GridBackground } from "@/components/aceternity/GridBackground";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisOutcome, AnalysisResult, JobStatus, SitemapCrawlReport } from "@/lib/api";
import { getResult, getStatus, postAnalyze, postSitemapAnalyze } from "@/lib/api";
type Phase = "idle" | "running" | "done" | "error";
type AnalysisMode = "single" | "sitemap";

function isSitemapReport(r: AnalysisOutcome): r is SitemapCrawlReport {
  return "kind" in r && r.kind === "sitemap_report";
}

function outcomeBadgeVariant(outcome: string): ComponentProps<typeof Badge>["variant"] {
  switch (outcome) {
    case "pass":
      return "success";
    case "fail":
      return "destructive";
    case "error":
      return "destructive";
    case "not_applicable":
      return "muted";
    case "informational":
      return "secondary";
    default:
      return "outline";
  }
}

function ScoreTile({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums">{value === null ? "—" : `${value}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={pct} className="h-1.5" />
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CountTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function FullAnalysisView({ result, embedded }: { result: AnalysisResult; embedded?: boolean }) {
  const auditRows = useMemo(() => {
    return Object.entries(result.normalized.pageSpeed.audits).map(([id, row]) => ({ id, ...row }));
  }, [result]);

  const [copied, setCopied] = useState(false);
  const copyPrompt = useCallback(async () => {
    if (!result.editorPrompt?.prompt) return;
    await navigator.clipboard.writeText(result.editorPrompt.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const shellClass = embedded
    ? "space-y-8"
    : "animate-fade-up space-y-8 opacity-0 [animation-fill-mode:forwards]";

  return (
    <div className={shellClass}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <p className="text-sm text-muted-foreground break-all">{result.url}</p>
          <div className="flex flex-wrap gap-2">
            {result.meta.cached ? (
              <Badge variant="warning" title="PageSpeed + scrape + Gemini came from Redis for this URL">
                Cached
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-mono text-xs">
              {new Date(result.meta.completedAt).toLocaleString()}
            </Badge>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Results</h2>
            <p className="text-sm text-muted-foreground">{result.url}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.meta.cached ? (
              <Badge variant="warning" title="PageSpeed + scrape + Gemini came from Redis for this URL">
                Cached pipeline
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-mono text-xs">
              {new Date(result.meta.completedAt).toLocaleString()}
            </Badge>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ScoreTile
          label="Lighthouse SEO category"
          value={result.seoScore}
          hint="Weighted score from Google—not an average of each audit row."
        />
        <ScoreTile
          label="GEO score (heuristic)"
          value={Math.round(result.geoScore.total)}
          hint="Hreflang, context, and latency placeholder."
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pagespeed">PageSpeed</TabsTrigger>
          <TabsTrigger value="geo">On-page</TabsTrigger>
          <TabsTrigger value="ai">AI plan</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Alert>
            <BarChart3 className="h-4 w-4" />
            <AlertTitle>Signals</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {result.normalized.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suggested title & description</CardTitle>
                <CardDescription>From AI; compare to live meta in the On-page tab.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Title</span>
                  <p className="mt-1 font-medium leading-snug">{result.gemini.meta_updates.title}</p>
                </div>
                <Separator />
                <div>
                  <span className="text-muted-foreground">Description</span>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{result.gemini.meta_updates.description}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Keywords</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.gemini.primary_keywords.map((k) => (
                  <Badge key={k} variant="default">
                    {k}
                  </Badge>
                ))}
                {result.gemini.secondary_keywords.map((k) => (
                  <Badge key={k} variant="secondary">
                    {k}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pagespeed" className="space-y-4">
          <Alert>
            <Globe2 className="h-4 w-4" />
            <AlertTitle>How to read scores</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">{result.normalized.pageSpeed.categorySummary}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Passed {result.normalized.pageSpeed.auditRollup.passed}</Badge>
            <Badge variant="destructive">Failed {result.normalized.pageSpeed.auditRollup.failed}</Badge>
            <Badge variant="muted">N/A {result.normalized.pageSpeed.auditRollup.notApplicable}</Badge>
            <Badge variant="secondary">Info {result.normalized.pageSpeed.auditRollup.informational}</Badge>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO audits</CardTitle>
              <CardDescription>Outcome labels reflect Lighthouse modes (binary, N/A, …).</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[min(28rem,55vh)] pr-3">
                <div className="space-y-2">
                  {auditRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/20 p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
                        <p className="font-medium leading-snug">{row.title ?? row.id}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{row.description}</p>
                      </div>
                      <Badge variant={outcomeBadgeVariant(row.outcome)} className="shrink-0 capitalize sm:ml-4">
                        {row.outcomeLabel}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geo" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parsed head</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Title</span>
                  <p className="mt-1">{result.normalized.parsed.title ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Meta description</span>
                  <p className="mt-1 text-muted-foreground">{result.normalized.parsed.metaDescription ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">html lang</span>
                  <p className="mt-1 font-mono">{result.normalized.parsed.htmlLang ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Headings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <HeadingList label="H1" items={result.normalized.parsed.h1} />
                <HeadingList label="H2" items={result.normalized.parsed.h2} />
                <HeadingList label="H3" items={result.normalized.parsed.h3} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hreflang links</CardTitle>
            </CardHeader>
            <CardContent>
              {result.normalized.parsed.hreflangLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">None detected in HTML.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {result.normalized.parsed.hreflangLinks.map((l) => (
                    <li key={`${l.hreflang}-${l.href}`} className="flex flex-wrap gap-2">
                      <Badge variant="outline">{l.hreflang}</Badge>
                      <span className="break-all text-muted-foreground">{l.href}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meta comparison</CardTitle>
              <CardDescription>Current vs suggested (deterministic slice).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
                <p className="font-medium">{result.suggestions.meta.currentTitle ?? "—"}</p>
                <p className="text-muted-foreground">{result.suggestions.meta.currentDescription ?? "—"}</p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Suggested</p>
                <p className="font-medium">{result.suggestions.meta.suggestedTitle}</p>
                <p className="text-muted-foreground">{result.suggestions.meta.suggestedDescription}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          {result.gemini.recommendations.map((rec, i) => (
            <Card key={`${rec.topic}-${i}`} className="border-border/80">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-base">{rec.topic}</CardTitle>
                    <CardDescription className="mt-1 leading-relaxed">{rec.rationale}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground/90">
                  <span className="font-medium text-primary">Action: </span>
                  {rec.action}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="prompt" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Editor prompt bundle</CardTitle>
                <CardDescription>Paste into your AI coding assistant to apply changes in your stack.</CardDescription>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyPrompt()}>
                <ClipboardCopy className="h-4 w-4" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[min(24rem,50vh)] rounded-md border border-border bg-secondary/20 p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                  {result.editorPrompt.prompt}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function App() {
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("single");
  const [url, setUrl] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [maxPagesInput, setMaxPagesInput] = useState("");
  const [context, setContext] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisOutcome | null>(null);
  const [skipPipelineCache, setSkipPipelineCache] = useState(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setResult(null);
  }, []);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setResult(null);
    setJobId(null);
    setPhase("running");
    setJobStatus("queued");
    try {
      if (analysisMode === "single") {
        const { jobId: id } = await postAnalyze({
          url: url.trim(),
          context: context.trim() || undefined,
          skipPipelineCache: skipPipelineCache || undefined,
        });
        setJobId(id);
      } else {
        const rawMax = maxPagesInput.trim();
        let maxPages: number | undefined;
        if (rawMax !== "") {
          const n = Number.parseInt(rawMax, 10);
          if (!Number.isFinite(n) || n < 1) {
            setError("Max pages must be a positive integer.");
            setPhase("error");
            return;
          }
          maxPages = n;
        }
        const { jobId: id } = await postSitemapAnalyze({
          sitemapUrl: sitemapUrl.trim(),
          context: context.trim() || undefined,
          maxPages,
          skipPipelineCache: skipPipelineCache || undefined,
        });
        setJobId(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setPhase("error");
    }
  }, [analysisMode, url, sitemapUrl, maxPagesInput, context, skipPipelineCache]);

  useEffect(() => {
    if (!jobId || phase !== "running") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const s = await getStatus(jobId);
        if (cancelled) return;
        setJobStatus(s.status);
        if (s.status === "failed") {
          setError(s.error ?? "Job failed");
          setPhase("error");
          return;
        }
        if (s.status === "completed") {
          const r = await getResult(jobId);
          if (cancelled) return;
          setResult(r.result);
          setPhase("done");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Status poll failed");
        setPhase("error");
      }
    };

    const id = window.setInterval(() => void tick(), 1500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, phase]);

  const singleResult = result && !isSitemapReport(result) ? result : null;

  return (
    <div className="relative min-h-screen">
      <GridBackground />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                <Activity className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary">
                SEO · GEO
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">What&apos;s your status</h1>
            <p className="max-w-xl text-muted-foreground">
              Lighthouse SEO signals, on-page structure, internationalization heuristics, and framework-agnostic AI
              recommendations—async via the API you already run.
            </p>
          </div>
          {phase !== "idle" ? (
            <Button type="button" variant="outline" onClick={reset}>
              New analysis
            </Button>
          ) : null}
        </header>

        {phase === "idle" || phase === "running" || phase === "error" ? (
          <Card className="mb-10 border-border/80 bg-card/70 shadow-xl backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                {analysisMode === "single" ? (
                  <Search className="h-5 w-5 text-primary" aria-hidden />
                ) : (
                  <LayoutList className="h-5 w-5 text-primary" aria-hidden />
                )}
                {analysisMode === "single" ? "Analyze a URL" : "Crawl from sitemap"}
              </CardTitle>
              <CardDescription>Queue a job on your API worker. Results appear when processing completes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={analysisMode === "single" ? "default" : "outline"}
                  onClick={() => setAnalysisMode("single")}
                  disabled={phase === "running"}
                >
                  Single page
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={analysisMode === "sitemap" ? "default" : "outline"}
                  onClick={() => setAnalysisMode("sitemap")}
                  disabled={phase === "running"}
                >
                  Sitemap crawl
                </Button>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                {analysisMode === "single" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="url">Page URL</Label>
                    <Input
                      id="url"
                      name="url"
                      type="url"
                      placeholder="https://example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={phase === "running"}
                      autoComplete="url"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="sitemap-url">Sitemap URL</Label>
                      <Input
                        id="sitemap-url"
                        name="sitemapUrl"
                        type="url"
                        placeholder="https://example.com/sitemap.xml"
                        value={sitemapUrl}
                        onChange={(e) => setSitemapUrl(e.target.value)}
                        disabled={phase === "running"}
                        autoComplete="url"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="max-pages">Max pages (optional)</Label>
                      <Input
                        id="max-pages"
                        name="maxPages"
                        type="number"
                        min={1}
                        placeholder={`Server default (e.g. 200)`}
                        value={maxPagesInput}
                        onChange={(e) => setMaxPagesInput(e.target.value)}
                        disabled={phase === "running"}
                      />
                      <p className="text-xs text-muted-foreground">
                        Each URL runs the full pipeline: PageSpeed, live scrape, HTML parse, GEO heuristics, and Gemini
                        (same as single-page). Large sitemaps take a long time and consume API quota.
                      </p>
                    </div>
                  </>
                )}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="context">Business / region context (optional)</Label>
                  <Textarea
                    id="context"
                    name="context"
                    placeholder="e.g. US + EU locales, product name, brand voice…"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    disabled={phase === "running"}
                    rows={3}
                  />
                </div>
                <div className="flex items-start gap-3 sm:col-span-2">
                  <input
                    id="skip-pipeline-cache"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border border-input bg-background accent-primary"
                    checked={skipPipelineCache}
                    onChange={(e) => setSkipPipelineCache(e.target.checked)}
                    disabled={phase === "running"}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="skip-pipeline-cache" className="cursor-pointer text-sm font-medium leading-none">
                      Skip server snapshot cache
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Re-run PageSpeed, live scrape, and Gemini instead of reusing the Redis snapshot per URL (~10 min
                      TTL). Applies to single-page jobs and each URL in a sitemap crawl.
                    </p>
                  </div>
                </div>
              </div>
              {error && phase === "error" ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Something went wrong</AlertTitle>
                  <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
                </Alert>
              ) : null}
              {phase === "running" ? (
                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                    <span>Job {jobId ?? "…"}</span>
                    {jobStatus ? (
                      <Badge variant="secondary" className="ml-auto capitalize">
                        {jobStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-primary/50 to-transparent bg-[length:200%_100%]" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analysisMode === "single"
                      ? "PageSpeed and LLM steps can take a minute. This bar is indeterminate—watch your worker logs for timings."
                      : "Sitemap jobs run the full pipeline per URL (often serially). Expect long runtimes; increase WORKER_LOCK_DURATION_MS if jobs time out."}
                  </p>
                </div>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void runAnalysis()}
                disabled={
                  phase === "running" ||
                  (analysisMode === "single" ? !url.trim() : !sitemapUrl.trim())
                }
              >
                {phase === "running" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Running…
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden />
                    Run analysis
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {phase === "done" && result && isSitemapReport(result) ? (
          <SitemapCrawlResults report={result} />
        ) : null}

        {phase === "done" && singleResult ? <FullAnalysisView result={singleResult} /> : null}
      </div>
    </div>
  );
}

function SitemapCrawlResults({ report }: { report: SitemapCrawlReport }) {
  const { summary } = report;
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [report.sitemapUrl, report.meta.completedAt]);

  const row = report.pages[pageIndex];
  let pipelineError = "";
  if (row != null && row.ok === false) {
    pipelineError = row.error;
  }

  return (
    <div className="animate-fade-up space-y-8 opacity-0 [animation-fill-mode:forwards]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Sitemap crawl report</h2>
          <p className="text-sm text-muted-foreground break-all">{report.sitemapUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.truncated ? (
            <Badge variant="warning" title="URL list hit the configured max pages cap">
              Truncated
            </Badge>
          ) : null}
          <Badge variant="outline" className="font-mono text-xs">
            {new Date(report.meta.completedAt).toLocaleString()}
          </Badge>
        </div>
      </div>

      <Alert>
        <LayoutList className="h-4 w-4" />
        <AlertTitle>Coverage</AlertTitle>
        <AlertDescription className="text-sm">
          Collected {report.urlsFromSitemap} URL{report.urlsFromSitemap === 1 ? "" : "s"} from the sitemap walk
          ({report.sitemapDocumentsFetched} sitemap document{report.sitemapDocumentsFetched === 1 ? "" : "s"} fetched).
          Ran PageSpeed, scrape, parse, and Gemini for {report.crawledCount} page{report.crawledCount === 1 ? "" : "s"}.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ScoreTile
          label="Avg. Lighthouse SEO (successful pages)"
          value={summary.averageSeoScore}
          hint="Mean category score where PageSpeed returned a score."
        />
        <CountTile label="Missing title" value={summary.missingTitle} hint="Pages with an empty document title." />
        <CountTile label="Missing meta description" value={summary.missingMetaDescription} hint="No meta description." />
        <CountTile label="Missing H1" value={summary.missingH1} hint="No primary heading." />
        <CountTile
          label="Pages with issues"
          value={summary.pagesWithIssues}
          hint="Pipeline failure or missing title, meta, or H1."
        />
        <CountTile
          label="Pipeline failures"
          value={summary.pipelineFailures}
          hint="PageSpeed, scrape, parse, or Gemini error for that URL."
        />
      </div>

      <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Per-page full analysis</CardTitle>
          <CardDescription>Same tabs as single-page mode: Lighthouse, on-page, AI plan, and editor prompt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sitemap-page-select">Page</Label>
            <select
              id="sitemap-page-select"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={pageIndex}
              onChange={(e) => setPageIndex(Number(e.target.value))}
            >
              {report.pages.map((p, i) => (
                <option key={`${p.url}-${i}`} value={i}>
                  {p.ok ? p.url : `${p.url} (failed)`}
                </option>
              ))}
            </select>
          </div>
          {row ? (
            row.ok ? (
              <FullAnalysisView result={row.result} embedded />
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Pipeline failed</AlertTitle>
                <AlertDescription className="font-mono text-xs break-all">{pipelineError}</AlertDescription>
              </Alert>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function HeadingList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-muted-foreground">—</p>
      ) : (
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {items.slice(0, 12).map((h) => (
            <li key={h} className="text-foreground/90">
              {h}
            </li>
          ))}
          {items.length > 12 ? <li className="text-muted-foreground">…and {items.length - 12} more</li> : null}
        </ul>
      )}
    </div>
  );
}
