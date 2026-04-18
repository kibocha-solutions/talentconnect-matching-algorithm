"use client";

import { ArrowLeft, Archive, Eye, EyeOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime, formatSalary } from "@/lib/format";
import type { ApplicationRecord } from "@/lib/schemas";
import { useWorkspace } from "@/lib/workspace-store";

type Props = {
  candidateId: string;
};

export function ApplicationDetailsPageClient({ candidateId }: Props) {
  const router = useRouter();
  const { applications, setApplications } = useWorkspace();
  const application = applications.find((item) => item.candidate_id === candidateId);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/applications");
  }

  if (!application) {
    return (
      <div className="grid gap-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Application Not Found</h2>
          <Button onClick={goBack} variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </section>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This candidate record is not in the current browser workspace.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedApplication = application;

  function updateApplication(mutator: (current: ApplicationRecord) => ApplicationRecord, message: string) {
    setApplications(
      (current) =>
        current.map((item) =>
          item.candidate_id === selectedApplication.candidate_id ? mutator(item) : item,
        ),
      {
        label: "Application updated",
        detail: selectedApplication.candidate_label,
      },
    );
    toast.success(message);
  }

  function deleteApplication() {
    setApplications(
      (current) => current.filter((item) => item.candidate_id !== selectedApplication.candidate_id),
      {
        label: "Application deleted",
        detail: `${selectedApplication.candidate_label} removed from workspace`,
      },
    );
    toast.success("Application deleted");
    router.push("/applications");
  }

  const hasPortfolio = Boolean(application.portfolio_url) || application.portfolio_projects.length > 0;

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Application details</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">{application.candidate_label}</h2>
        </div>
        <Button onClick={goBack} variant="outline">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => updateApplication((item) => ({ ...item, visible: !item.visible, updated_at: new Date().toISOString() }), application.visible ? "Application hidden" : "Application shown")}
              variant="outline"
            >
              {application.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {application.visible ? "Hide" : "Show"}
            </Button>
            <Button
              onClick={() => updateApplication((item) => ({ ...item, archived: true, visible: false, updated_at: new Date().toISOString() }), "Application archived")}
              variant="outline"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
            <Button onClick={deleteApplication} variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Candidate" value={application.candidate_label} />
            <DetailItem label="Experience" value={`${application.years_of_experience} yrs`} />
            <DetailItem label="Salary expectation" value={formatSalary(application.salary_expectation)} />
            <DetailItem label="Updated" value={formatDateTime(application.updated_at)} />
            <DetailItem label="Portfolio" value={hasPortfolio ? "Available" : "Not provided"} />
          </div>

          <div className="grid gap-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {application.skills.map((skill) => (
                <Badge key={skill}>{skill}</Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Extracted summary</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{application.extracted_text}</p>
          </div>

          {application.video_transcript ? (
            <div>
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">Video transcript</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{application.video_transcript}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <strong className="mt-1 block break-words text-sm font-medium">{value}</strong>
    </div>
  );
}
