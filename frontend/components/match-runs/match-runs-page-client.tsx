"use client";

import { AlertTriangle, Play, RefreshCw, SplitSquareVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import {
  runBulkMatchRequest,
  type BulkMatchItemPayload,
  type BulkMatchResponsePayload,
  type MatchResult,
  type StructuredApiError,
} from "@/lib/api";
import { toCandidatePayload, toJobPayload } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";

type MatchRunRecord = {
  jobId: string;
  jobTitle: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  shortlistedCount: number;
  completedAt: string;
  results: MatchResult[];
};

type DetailedResult = MatchResult & {
  jobTitle: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
};

type MatchRunFailure = {
  jobId: string;
  jobTitle: string;
  status: number;
  code?: string;
  message: string;
};

const BULK_JOB_BATCH_SIZE = 2;
const BULK_BATCH_RETRY_ATTEMPTS = 2;
const BULK_BATCH_RETRY_DELAY_MS = 900;

export function MatchRunsPageClient() {
  const router = useRouter();
  const { jobs, applications, apiStatus, apiStatusLoading, refreshApiStatus } = useWorkspace();
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(true);
  const [candidateMode, setCandidateMode] = useState<"visible" | "selected">("visible");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<StructuredApiError | null>(null);
  const [runFailures, setRunFailures] = useState<MatchRunFailure[]>([]);
  const [matchRuns, setMatchRuns] = useState<MatchRunRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const activeJobs = useMemo(() => jobs.filter((job) => job.visible && !job.archived), [jobs]);
  const visibleApplications = useMemo(
    () => applications.filter((application) => application.visible && !application.archived),
    [applications],
  );

  const selectedCandidates = useMemo(() => {
    if (candidateMode === "visible") {
      return visibleApplications;
    }
    const selected = applications.filter((application) => selectedCandidateIds.includes(application.candidate_id));
    return selected;
  }, [applications, candidateMode, selectedCandidateIds, visibleApplications]);

  const selectedJobs = useMemo(
    () => activeJobs.filter((job) => selectedJobIds.includes(job.job_id)),
    [activeJobs, selectedJobIds],
  );

  const activeRun = useMemo(() => {
    if (!matchRuns.length) {
      return null;
    }
    const preferred = activeJobId ? matchRuns.find((run) => run.jobId === activeJobId) : null;
    return preferred ?? matchRuns[0];
  }, [activeJobId, matchRuns]);

  const detailedResults = useMemo<DetailedResult[]>(() => {
    if (!activeRun) {
      return [];
    }
    return activeRun.results.map((result) => ({
      ...result,
      jobTitle: activeRun.jobTitle,
      provider: activeRun.provider,
      model: activeRun.model,
      fallbackUsed: activeRun.fallbackUsed,
    }));
  }, [activeRun]);

  const compareResults = useMemo(() => {
    return detailedResults.filter((result) => compareIds.includes(result.candidate_id));
  }, [compareIds, detailedResults]);

  async function executeMatching() {
    if (!selectedJobs.length) {
      toast.error("Select at least one visible job.");
      return;
    }

    if (!selectedCandidates.length) {
      toast.error(candidateMode === "visible" ? "No visible applications are available." : "Select at least one application.");
      return;
    }

    setRunning(true);
    setRunError(null);
    setRunFailures([]);
    setCompareIds([]);
    setSelectionOpen(false);

    try {
      const latestStatus = await refreshApiStatus();
      if (latestStatus.health !== "reachable") {
        const message =
          latestStatus.message ??
          "Backend is not reachable. Start the backend service, then run matching again.";
        const structured = {
          status: 503,
          code: "TC-503-BACKEND_UNREACHABLE",
          message,
          fieldErrors: [],
        } satisfies StructuredApiError;
        setRunError(structured);
        setMatchRuns([]);
        setActiveJobId(null);
        toast.error(message);
        return;
      }

      if (latestStatus.matchEndpoint !== "reachable") {
        toast.warning(
          "Backend health is reachable, but metadata check is unavailable. Proceeding with batched matching.",
        );
      }

      const jobTitleById = new Map(selectedJobs.map((job) => [job.job_id, job.title]));
      const candidatePayload = selectedCandidates.map((candidate) => toCandidatePayload(candidate));
      const jobBatches = chunkArray(selectedJobs, BULK_JOB_BATCH_SIZE);

      const aggregatedMatches: BulkMatchItemPayload[] = [];
      const aggregatedFailures: MatchRunFailure[] = [];

      for (const jobBatch of jobBatches) {
        const batchJobsPayload = jobBatch.map((job) => toJobPayload(job));
        try {
          const response = await runBulkWithRetry({
            jobs: batchJobsPayload,
            candidates: candidatePayload,
          });
          aggregatedMatches.push(...response.matches);
          aggregatedFailures.push(...toRunFailures(response, jobTitleById));
        } catch (error) {
          const structured = toStructured(error);
          aggregatedFailures.push(
            ...jobBatch.map((job) => ({
              jobId: job.job_id,
              jobTitle: job.title,
              status: structured.status,
              code: structured.code,
              message: structured.message,
            })),
          );
        }
      }

      const responses = aggregatedMatches.map((match) =>
        toMatchRun(jobTitleById.get(match.job_id) ?? truncateId(match.job_id), match),
      );
      const failures = aggregatedFailures;

      setMatchRuns(responses);
      setRunFailures(failures);
      setActiveJobId(responses[0]?.jobId ?? null);
      if (failures.length) {
        toast.warning(
          `Matching completed with ${failures.length} failed job${failures.length === 1 ? "" : "s"}.`,
        );
      } else {
        toast.success(`Matching completed for ${responses.length} job${responses.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      const structured = toStructured(error);
      setRunError(structured);
      setRunFailures([]);
      setMatchRuns([]);
      setActiveJobId(null);
      toast.error(structured.message);
    } finally {
      setRunning(false);
    }
  }

  function toggleJob(jobId: string) {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((value) => value !== jobId) : [...current, jobId],
    );
  }

  function toggleCandidate(candidateId: string) {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((value) => value !== candidateId)
        : [...current, candidateId],
    );
  }

  function toggleCompare(candidateId: string) {
    setCompareIds((current) => {
      if (current.includes(candidateId)) {
        return current.filter((value) => value !== candidateId);
      }
      if (current.length >= 3) {
        toast.error("Compare supports up to three candidates.");
        return current;
      }
      return [...current, candidateId];
    });
  }

  function openResultDetail(result: DetailedResult) {
    const detail = encodeURIComponent(
      JSON.stringify({
        ...result,
        matchedLabel:
          applications.find((application) => application.candidate_id === result.candidate_id)
            ?.candidate_label ?? truncateId(result.candidate_id),
      }),
    );
    router.push(`/match-runs/${result.job_id}/${result.candidate_id}?detail=${detail}`);
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Run backend matching operations</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Match Runs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Select jobs and candidate sets, run matching against the backend, and inspect ranked output with score
            breakdown details.
          </p>
        </div>
        <Button
          disabled={running || apiStatusLoading || apiStatus.health !== "reachable"}
          onClick={() => void executeMatching()}
        >
          {running ? <Spinner /> : <Play className="h-4 w-4" />}
          Run matching
        </Button>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Selection workspace</h3>
              <p className="text-sm text-muted-foreground">
                Pick jobs and candidates, then run matching. This panel auto-collapses after a run starts.
              </p>
            </div>
            <Button onClick={() => setSelectionOpen((current) => !current)} size="sm" variant="outline">
              {selectionOpen ? "Collapse" : "Expand"}
            </Button>
          </div>
        </CardHeader>
        {selectionOpen ? (
          <CardContent>
            <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold tracking-tight">1. Select jobs</h3>
                  <p className="text-sm text-muted-foreground">Choose one or more visible jobs to score.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setSelectedJobIds(activeJobs.map((job) => job.job_id))} size="sm" variant="outline">
                      Select all
                    </Button>
                    <Button onClick={() => setSelectedJobIds([])} size="sm" variant="outline">
                      Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {activeJobs.length ? (
                    activeJobs.map((job) => {
                      const checked = selectedJobIds.includes(job.job_id);
                      return (
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3",
                            checked && "border-primary/50 bg-primary/5",
                          )}
                          key={job.job_id}
                        >
                          <input
                            checked={checked}
                            className="mt-1 h-4 w-4"
                            onChange={() => toggleJob(job.job_id)}
                            type="checkbox"
                          />
                          <span className="min-w-0">
                            <strong className="block truncate text-sm">{job.title}</strong>
                            <span className="block text-xs text-muted-foreground">{job.company}</span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <EmptyState label="No visible jobs are available." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold tracking-tight">2. Select applications</h3>
                  <p className="text-sm text-muted-foreground">Use all visible applications or pick a specific subset.</p>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="inline-flex rounded-md border border-border bg-muted p-1">
                    <button
                      className={cn("rounded px-4 py-2 text-sm font-medium", candidateMode === "visible" && "bg-card shadow-sm")}
                      onClick={() => setCandidateMode("visible")}
                      type="button"
                    >
                      Visible set ({visibleApplications.length})
                    </button>
                    <button
                      className={cn("rounded px-4 py-2 text-sm font-medium", candidateMode === "selected" && "bg-card shadow-sm")}
                      onClick={() => setCandidateMode("selected")}
                      type="button"
                    >
                      Selected subset ({selectedCandidateIds.length})
                    </button>
                  </div>

                  {candidateMode === "selected" ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setSelectedCandidateIds(applications.map((item) => item.candidate_id))} size="sm" variant="outline">
                          Select all
                        </Button>
                        <Button onClick={() => setSelectedCandidateIds([])} size="sm" variant="outline">
                          Clear
                        </Button>
                      </div>
                      <div className="grid max-h-72 gap-2 overflow-auto rounded-md border border-border p-2">
                        {applications.map((application) => {
                          const checked = selectedCandidateIds.includes(application.candidate_id);
                          return (
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2",
                                checked && "border-primary/50 bg-primary/5",
                              )}
                              key={application.candidate_id}
                            >
                              <input checked={checked} onChange={() => toggleCandidate(application.candidate_id)} type="checkbox" />
                              <span className="min-w-0 text-sm">
                                <strong className="block truncate">{application.candidate_label}</strong>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {application.skills.slice(0, 3).join(" / ")}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                      {visibleApplications.length
                        ? `${visibleApplications.length} visible applications will be sent to the match endpoint.`
                        : "No visible applications are available."}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </CardContent>
        ) : null}
      </Card>

      {runError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-lg font-semibold tracking-tight">Match request failed</h3>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>{runError.message}</p>
            {runError.code ? <p className="text-muted-foreground">Code: {runError.code}</p> : null}
            {runError.fieldErrors.length ? (
              <div className="rounded-md border border-destructive/30 bg-red-50 p-3">
                <ul className="grid gap-1 text-destructive">
                  {runError.fieldErrors.map((issue) => (
                    <li key={`${issue.field}-${issue.message}`}>
                      {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {runFailures.length ? (
        <Card className="border-yellow-600/40">
          <CardHeader>
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-lg font-semibold tracking-tight">Some jobs failed</h3>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {runFailures.map((failure) => (
              <div className="rounded-md border border-yellow-600/30 bg-yellow-50 p-3" key={failure.jobId}>
                <p className="font-medium">{failure.jobTitle}</p>
                <p>{failure.message}</p>
                <p className="text-muted-foreground">
                  {failure.code ? `${failure.code} • ` : ""}HTTP {failure.status}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">3. Ranked results</h3>
              <p className="text-sm text-muted-foreground">Compact ranking view with details on demand.</p>
            </div>
            {activeRun ? (
              <Badge variant="outline">
                <RefreshCw className="h-3.5 w-3.5" />
                {formatDateTime(activeRun.completedAt)}
              </Badge>
            ) : null}
          </div>
          {matchRuns.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {matchRuns.map((run) => (
                <Button
                  className="justify-start"
                  key={run.jobId}
                  onClick={() => setActiveJobId(run.jobId)}
                  size="sm"
                  variant={activeRun?.jobId === run.jobId ? "default" : "outline"}
                >
                  {run.jobTitle}
                </Button>
              ))}
            </div>
          ) : null}
        </CardHeader>

        <CardContent>
          {activeRun ? (
            <div className="grid gap-4">
              <div className="grid gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Shortlist size" value={String(activeRun.shortlistedCount)} />
                <Metric label="Provider" value={activeRun.provider} />
                <Metric label="Model" value={activeRun.model} />
                <Metric label="Fallback" value={activeRun.fallbackUsed ? "Used" : "Not used"} />
              </div>

              <div className="grid gap-2">
                {detailedResults.length ? (
                  detailedResults
                    .slice()
                    .sort((left, right) => right.overall_score - left.overall_score)
                    .map((result) => {
                      const candidate = applications.find((item) => item.candidate_id === result.candidate_id);
                      const compareChecked = compareIds.includes(result.candidate_id);
                      return (
                        <article className="rounded-md border border-border bg-background p-4" key={result.candidate_id}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <button
                              className="min-w-0 text-left"
                              onClick={() => openResultDetail(result)}
                              type="button"
                            >
                              <strong className="block truncate text-sm">
                                {candidate?.candidate_label ?? truncateId(result.candidate_id)}
                              </strong>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {buildStrengthSummary(result)}
                              </span>
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">Score {result.overall_score.toFixed(1)}</Badge>
                              <Badge variant={result.fallbackUsed ? "warning" : "secondary"}>
                                {result.provider}/{result.model}
                              </Badge>
                              <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                                <input checked={compareChecked} onChange={() => toggleCompare(result.candidate_id)} type="checkbox" />
                                Compare
                              </label>
                            </div>
                          </div>
                        </article>
                      );
                    })
                ) : (
                  <EmptyState label="No ranked results were returned for the selected job." />
                )}
              </div>
            </div>
          ) : (
            <EmptyState label="Run matching to inspect ranked results." />
          )}
        </CardContent>
      </Card>

      {compareResults.length >= 2 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SplitSquareVertical className="h-4 w-4" />
              <h3 className="text-lg font-semibold tracking-tight">Candidate comparison</h3>
            </div>
            <p className="text-sm text-muted-foreground">Side-by-side comparison for two to three ranked candidates.</p>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-3">
            {compareResults.map((result) => {
              const candidate = applications.find((item) => item.candidate_id === result.candidate_id);
              return (
                <div className="rounded-md border border-border bg-background p-4" key={result.candidate_id}>
                  <strong className="block text-sm">{candidate?.candidate_label ?? truncateId(result.candidate_id)}</strong>
                  <div className="mt-3 grid gap-2 text-sm">
                    <Metric label="Overall" value={result.overall_score.toFixed(1)} />
                    <Metric label="Skills" value={result.score_breakdown.skills_score.toFixed(1)} />
                    <Metric label="Experience" value={result.score_breakdown.experience_score.toFixed(1)} />
                    <Metric label="Salary" value={result.score_breakdown.salary_score.toFixed(1)} />
                    <Metric label="Portfolio" value={String(result.score_breakdown.portfolio_score)} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <strong className="ml-2 text-sm">{value}</strong>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function toMatchRun(jobTitle: string, response: BulkMatchItemPayload): MatchRunRecord {
  return {
    jobId: response.job_id,
    jobTitle,
    provider: response.retrieval_provider,
    model: response.retrieval_model,
    fallbackUsed: response.retrieval_fallback_used,
    shortlistedCount: response.shortlist_size,
    completedAt: new Date().toISOString(),
    results: response.results,
  };
}

function toStructured(error: unknown): StructuredApiError {
  if (error && typeof error === "object" && "status" in error && "message" in error) {
    return error as StructuredApiError;
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Matching request failed.",
    fieldErrors: [],
  };
}

function toRunFailures(
  response: BulkMatchResponsePayload,
  jobTitleById: Map<string, string>,
): MatchRunFailure[] {
  return response.failures.map((failure) => ({
    jobId: failure.job_id,
    jobTitle: jobTitleById.get(failure.job_id) ?? truncateId(failure.job_id),
    status: failure.error.status,
    code: failure.error.code,
    message: failure.error.message,
  }));
}

function truncateId(value: string) {
  return `${value.slice(0, 8)}...`;
}

async function runBulkWithRetry(payload: {
  jobs: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
}) {
  let attempt = 0;
  while (true) {
    try {
      return await runBulkMatchRequest(payload);
    } catch (error) {
      const structured = toStructured(error);
      const retryable = structured.status >= 500;
      if (!retryable || attempt >= BULK_BATCH_RETRY_ATTEMPTS) {
        throw error;
      }
      attempt += 1;
      await delay(BULK_BATCH_RETRY_DELAY_MS);
    }
  }
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) {
    return [values];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildStrengthSummary(result: MatchResult) {
  const entries = [
    { label: "skills", value: result.score_breakdown.skills_score },
    { label: "experience", value: result.score_breakdown.experience_score },
    { label: "salary", value: result.score_breakdown.salary_score },
    { label: "portfolio", value: result.score_breakdown.portfolio_score },
  ].sort((left, right) => right.value - left.value);

  return `Top strengths: ${entries[0].label} ${entries[0].value.toFixed(0)}, ${entries[1].label} ${entries[1].value.toFixed(0)}`;
}
