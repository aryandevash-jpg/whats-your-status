import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  Globe2,
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
import type { AnalysisResult, JobStatus } from "@/lib/api";
import { getResult, getStatus, postAnalyze } from "@/lib/api";
type Phase = "idle" | "running" | "done" | "error";

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

export default function App() {
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setResult(null);
    setCopied(false);
  }, []);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setResult(null);
    setJobId(null);
    setPhase("running");
    setJobStatus("queued");
    try {
      const { jobId: id } = await postAnalyze({
        url: url.trim(),
        context: context.trim() || undefined,
      });
      setJobId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setPhase("error");
    }
  }, [url, context]);

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

  const auditRows = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.normalized.pageSpeed.audits).map(([id, row]) => ({ id, ...row }));
  }, [result]);

  const copyPrompt = useCallback(async () => {
    if (!result?.editorPrompt?.prompt) return;
    await navigator.clipboard.writeText(result.editorPrompt.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [result]);

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
                <Search className="h-5 w-5 text-primary" aria-hidden />
                Analyze a URL
              </CardTitle>
              <CardDescription>Queue a job on your API worker. Results appear when processing completes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
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
                    PageSpeed and LLM steps can take a minute. This bar is indeterminate—watch your worker logs for
                    timings.
                  </p>
                </div>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void runAnalysis()}
                disabled={phase === "running" || !url.trim()}
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

        {phase === "done" && result ? (
          <div className="animate-fade-up space-y-8 opacity-0 [animation-fill-mode:forwards]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Results</h2>
                <p className="text-sm text-muted-foreground">{result.url}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.meta.cached ? <Badge variant="warning">Cached pipeline</Badge> : null}
                <Badge variant="outline" className="font-mono text-xs">
                  {new Date(result.meta.completedAt).toLocaleString()}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ScoreTile
                label="Lighthouse SEO category"
                value={result.seoScore}
                hint="Weighted score from Google—not an average of each audit row."
              />
              <ScoreTile label="GEO score (heuristic)" value={Math.round(result.geoScore.total)} hint="Hreflang, context, and latency placeholder." />
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
        ) : null}
      </div>
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
