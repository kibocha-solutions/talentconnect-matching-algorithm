"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

type ScoreBreakdown = {
  skills_score: number;
  experience_score: number;
  salary_score: number;
  portfolio_score: number;
};

type MatchResultDetail = {
  candidate_id: string;
  job_id: string;
  overall_score: number;
  score_breakdown: ScoreBreakdown;
  matched_at: string;
  jobTitle: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  matchedLabel?: string;
};

type Props = {
  detailParam?: string;
};

export function MatchResultPageClient({ detailParam }: Props) {
  const router = useRouter();
  const detail = parseDetail(detailParam);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/match-runs");
  }

  if (!detail) {
    return (
      <div className="grid gap-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Match Result Not Available</h2>
          <Button onClick={goBack} variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </section>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This page needs match detail data from the Match Runs screen. Run matching and open a result again.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Match result details</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            {detail.matchedLabel ?? truncateId(detail.candidate_id)}
          </h2>
        </div>
        <Button onClick={goBack} variant="outline">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </section>

      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">Full match breakdown, provider metadata, and raw response.</p>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Candidate" value={detail.matchedLabel ?? truncateId(detail.candidate_id)} />
            <MetricCard label="Job" value={detail.jobTitle} />
            <MetricCard label="Overall score" value={detail.overall_score.toFixed(2)} />
            <MetricCard label="Matched at" value={formatDateTime(detail.matched_at)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Skills score" value={detail.score_breakdown.skills_score.toFixed(2)} />
            <MetricCard label="Experience score" value={detail.score_breakdown.experience_score.toFixed(2)} />
            <MetricCard label="Salary score" value={detail.score_breakdown.salary_score.toFixed(2)} />
            <MetricCard label="Portfolio score" value={String(detail.score_breakdown.portfolio_score)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Provider" value={detail.provider} />
            <MetricCard label="Model" value={detail.model} />
            <MetricCard label="Fallback used" value={detail.fallbackUsed ? "Yes" : "No"} />
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Raw structured result</h3>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <strong className="mt-1 block break-words text-sm font-medium">{value}</strong>
    </div>
  );
}

function parseDetail(detailParam?: string): MatchResultDetail | null {
  if (!detailParam) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(detailParam)) as MatchResultDetail;
    if (!parsed.candidate_id || !parsed.job_id || !parsed.score_breakdown) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function truncateId(value: string) {
  return `${value.slice(0, 8)}...`;
}
