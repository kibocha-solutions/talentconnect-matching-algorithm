"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { jobRecordSchema } from "@/lib/schemas";
import { useWorkspace } from "@/lib/workspace-store";

const jobFormSchema = z.object({
  title: z.string().trim().min(2, "Add a clear job title."),
  company: z.string().trim().min(2, "Add a company or source."),
  source: z.string().trim().min(2, "Add a source label."),
  primary_stack: z.string().trim().min(2, "Add a primary stack."),
  experience_level: z.string().trim().min(2, "Add an experience level."),
  job_id: z.string().uuid(),
  employer_id: z.string().uuid(),
  required_skills_text: z.string().trim().min(1, "Add at least one required skill."),
  nice_to_have_skills_text: z.string(),
  experience_range: z.object({
    min_years: z.coerce.number().nonnegative(),
    max_years: z.coerce.number().nonnegative(),
  }),
  salary_offered: z.object({
    currency: z.string().trim().length(3, "Use a three-letter currency code."),
    min_amount: z.coerce.number().nonnegative(),
    max_amount: z.coerce.number().nonnegative(),
  }),
  job_description_text: z.string().trim().min(40, "Description must be at least 40 characters."),
  portfolio_required: z.boolean(),
  visible: z.boolean(),
  archived: z.boolean(),
});

type JobFormValues = z.infer<typeof jobFormSchema>;

const emptyForm = (): JobFormValues => ({
  title: "",
  company: "",
  source: "Direct",
  primary_stack: "",
  experience_level: "Mid",
  job_id: crypto.randomUUID(),
  employer_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  required_skills_text: "",
  nice_to_have_skills_text: "",
  experience_range: { min_years: 3, max_years: 6 },
  salary_offered: { currency: "USD", min_amount: 85000, max_amount: 120000 },
  job_description_text: "",
  portfolio_required: false,
  visible: true,
  archived: false,
});

export function JobCreatePageClient() {
  const router = useRouter();
  const { setJobs } = useWorkspace();

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: emptyForm(),
  });

  const saving = form.formState.isSubmitting;

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/jobs");
  }

  const onSubmit = form.handleSubmit((values) => {
    const now = new Date().toISOString();
    const nextJob = jobRecordSchema.parse({
      ...values,
      required_skills: splitList(values.required_skills_text),
      nice_to_have_skills: splitList(values.nice_to_have_skills_text),
      created_at: now,
      updated_at: now,
    });

    setJobs(
      (current) => [nextJob, ...current.filter((job) => job.job_id !== nextJob.job_id)],
      {
        label: "Job created",
        detail: `${nextJob.title} at ${nextJob.company}`,
      },
    );

    toast.success("Job created");
    router.push("/jobs");
  });

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Create a new job record</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Add Job</h2>
        </div>
        <Button onClick={goBack} variant="outline">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </section>

      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">Complete the job fields, then save to return to the Jobs list.</p>
        </CardHeader>
        <CardContent>
          <form className="mx-auto grid w-full max-w-3xl gap-5" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.title?.message}>
                Title
                <Input {...form.register("title")} placeholder="Backend API Engineer" />
              </Label>
              <Label error={form.formState.errors.company?.message}>
                Company or source
                <Input {...form.register("company")} placeholder="HelioHire" />
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.primary_stack?.message}>
                Primary stack
                <Input {...form.register("primary_stack")} placeholder="Python / FastAPI / PostgreSQL" />
              </Label>
              <Label error={form.formState.errors.experience_level?.message}>
                Experience level
                <Input {...form.register("experience_level")} placeholder="Mid" />
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.required_skills_text?.message}>
                Required skills
                <Input {...form.register("required_skills_text")} placeholder="Python, FastAPI, PostgreSQL" />
              </Label>
              <Label>
                Nice to have
                <Input {...form.register("nice_to_have_skills_text")} placeholder="Docker, Redis" />
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Label>
                Min yrs
                <Input min={0} step="0.5" type="number" {...form.register("experience_range.min_years")} />
              </Label>
              <Label error={form.formState.errors.experience_range?.max_years?.message}>
                Max yrs
                <Input min={0} step="0.5" type="number" {...form.register("experience_range.max_years")} />
              </Label>
              <Label error={form.formState.errors.salary_offered?.currency?.message}>
                Currency
                <Input {...form.register("salary_offered.currency")} />
              </Label>
              <Label>
                Min salary
                <Input min={0} type="number" {...form.register("salary_offered.min_amount")} />
              </Label>
              <Label error={form.formState.errors.salary_offered?.max_amount?.message}>
                Max salary
                <Input min={0} type="number" {...form.register("salary_offered.max_amount")} />
              </Label>
            </div>
            <Label error={form.formState.errors.job_description_text?.message}>
              Description
              <Textarea rows={5} {...form.register("job_description_text")} />
            </Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.source?.message}>
                Source
                <Input {...form.register("source")} />
              </Label>
              <Label>
                Employer ID
                <Input {...form.register("employer_id")} />
              </Label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input className="h-4 w-4 rounded border-border" type="checkbox" {...form.register("portfolio_required")} />
              Portfolio required
            </label>
            <Button disabled={saving} type="submit">
              {saving ? <Spinner /> : <Plus className="h-4 w-4" />}
              Save job
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function splitList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
