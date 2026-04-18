"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, FileInput, FileUser, PlaySquare, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useOverviewMetrics, useWorkspace } from "@/lib/workspace-store";

const quickActions = [
  { label: "Add job", href: "/jobs/new", icon: BriefcaseBusiness },
  { label: "Add application", href: "/applications/new", icon: FileUser },
  { label: "Import records", href: "/import-export", icon: FileInput },
  { label: "Run matching", href: "/match-runs", icon: PlaySquare },
];

export default function OverviewPage() {
  const metrics = useOverviewMetrics();
  const { activity, apiStatus, apiStatusLoading } = useWorkspace();

  const cards = [
    { label: "Total jobs", value: metrics.totalJobs, detail: "Current workspace records" },
    { label: "Visible jobs", value: metrics.visibleJobs, detail: "Available for matching" },
    { label: "Hidden jobs", value: metrics.hiddenJobs, detail: "Excluded from visible sets" },
    { label: "Applications", value: metrics.totalApplications, detail: "Current candidate records" },
    { label: "Imported jobs", value: metrics.importedJobRecords, detail: "Confirmed through import" },
    { label: "Imported applications", value: metrics.importedApplicationRecords, detail: "Confirmed through import" },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">A frontend for TalentConnect matching operations.</p>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Operational overview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review current records, check backend reachability, and move into focused workflows without scanning dense data.
            </p>
          </div>
          <Badge variant={apiStatus.health === "reachable" ? "success" : "warning"}>
            {apiStatusLoading ? "Checking API" : apiStatus.health === "reachable" ? "API reachable" : "API offline"}
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
            </CardHeader>
            <CardContent>
              <strong className="text-3xl font-semibold tracking-tight">{card.value}</strong>
              <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold tracking-tight">Quick actions</h3>
            <p className="text-sm text-muted-foreground">Start the common operations from one place.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  className="group flex min-h-24 items-center justify-between gap-4 rounded-md border border-border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-muted"
                  href={action.href}
                  key={action.label}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-medium">{action.label}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">System status</h3>
                <p className="text-sm text-muted-foreground">Backend reachability and matching readiness.</p>
              </div>
              <Server className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <StatusRow label="API base URL" value={apiStatus.apiBaseUrl} />
            <StatusRow label="Backend" value={apiStatus.health} />
            <StatusRow label="Match endpoint" value={apiStatus.matchEndpoint} />
            {apiStatus.provider ? <StatusRow label="Provider" value={apiStatus.provider} /> : null}
            {apiStatus.modelStatus ? <StatusRow label="Model" value={apiStatus.modelStatus} /> : null}
            <p className="rounded-md bg-muted p-3 text-muted-foreground">
              {apiStatus.message ?? "No API status message is available."}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold tracking-tight">Recent activity</h3>
          <p className="text-sm text-muted-foreground">Workspace changes from the current browser session.</p>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <div className="grid gap-3">
              {activity.slice(0, 5).map((item) => (
                <article className="rounded-md border border-border bg-background p-3" key={item.id}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <strong className="text-sm">{item.label}</strong>
                    <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No activity has been recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right font-medium capitalize">{value}</strong>
    </div>
  );
}
