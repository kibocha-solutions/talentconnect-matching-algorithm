"use client";

import { ArrowLeft, Archive, Eye, EyeOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime, formatExperience, formatSalary } from "@/lib/format";
import type { JobRecord } from "@/lib/schemas";
import { useWorkspace } from "@/lib/workspace-store";

type Props = {
  jobId: string;
};

export function JobDetailsPageClient({ jobId }: Props) {
  const router = useRouter();
  const { jobs, setJobs } = useWorkspace();
  const job = jobs.find((item) => item.job_id === jobId);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/jobs");
  }

  if (!job) {
    return (
      <div className="grid gap-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Job Not Found</h2>
          <Button onClick={goBack} variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </section>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This job record is not in the current browser workspace.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedJob = job;

  function updateJob(mutator: (current: JobRecord) => JobRecord, message: string) {
    setJobs(
      (current) => current.map((item) => (item.job_id === selectedJob.job_id ? mutator(item) : item)),
      {
        label: "Job updated",
        detail: `${selectedJob.title} at ${selectedJob.company}`,
      },
    );
    toast.success(message);
  }

  function deleteJob() {
    setJobs(
      (current) => current.filter((item) => item.job_id !== selectedJob.job_id),
      {
        label: "Job deleted",
        detail: `${selectedJob.title} removed from workspace`,
      },
    );
    toast.success("Job deleted");
    router.push("/jobs");
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Job details</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">{job.title}</h2>
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
              onClick={() => updateJob((item) => ({ ...item, visible: !item.visible, updated_at: new Date().toISOString() }), job.visible ? "Job hidden" : "Job shown")}
              variant="outline"
            >
              {job.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {job.visible ? "Hide" : "Show"}
            </Button>
            <Button
              onClick={() => updateJob((item) => ({ ...item, archived: true, visible: false, updated_at: new Date().toISOString() }), "Job archived")}
              variant="outline"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
            <Button onClick={deleteJob} variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Company" value={job.company} />
            <DetailItem label="Source" value={job.source} />
            <DetailItem label="Primary stack" value={job.primary_stack} />
            <DetailItem label="Experience" value={formatExperience(job.experience_range)} />
            <DetailItem label="Salary" value={formatSalary(job.salary_offered)} />
            <DetailItem label="Updated" value={formatDateTime(job.updated_at)} />
          </div>

          <div className="grid gap-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {job.required_skills.map((skill) => (
                <Badge key={skill}>{skill}</Badge>
              ))}
              {job.nice_to_have_skills.map((skill) => (
                <Badge key={skill} variant="secondary">{skill}</Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Description</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{job.job_description_text}</p>
          </div>
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
