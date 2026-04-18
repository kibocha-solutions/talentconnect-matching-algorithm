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
import { applicationRecordSchema } from "@/lib/schemas";
import { useWorkspace } from "@/lib/workspace-store";

const applicationFormSchema = z.object({
  candidate_id: z.string().uuid(),
  candidate_label: z.string().trim().min(2, "Add a clear candidate label."),
  skills_text: z.string().trim().min(1, "Add at least one skill."),
  years_of_experience: z.coerce.number().nonnegative(),
  salary_expectation: z.object({
    currency: z.string().trim().length(3, "Use a three-letter currency code."),
    min_amount: z.coerce.number().nonnegative(),
    max_amount: z.coerce.number().nonnegative(),
  }),
  portfolio_url: z.string().trim().url("Use a valid URL.").optional().or(z.literal("")),
  extracted_text: z.string().trim().min(40, "Extracted text must be at least 40 characters."),
  video_transcript: z.string().trim().min(20, "Transcript must be at least 20 characters.").optional().or(z.literal("")),
  visible: z.boolean(),
  archived: z.boolean(),
});

type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

const emptyForm = (): ApplicationFormValues => ({
  candidate_id: crypto.randomUUID(),
  candidate_label: "",
  skills_text: "",
  years_of_experience: 3,
  salary_expectation: { currency: "USD", min_amount: 85000, max_amount: 120000 },
  portfolio_url: "",
  extracted_text: "",
  video_transcript: "",
  visible: true,
  archived: false,
});

export function ApplicationCreatePageClient() {
  const router = useRouter();
  const { setApplications } = useWorkspace();

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: emptyForm(),
  });

  const saving = form.formState.isSubmitting;

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/applications");
  }

  const onSubmit = form.handleSubmit((values) => {
    const now = new Date().toISOString();
    const nextApplication = applicationRecordSchema.parse({
      candidate_id: values.candidate_id,
      candidate_label: values.candidate_label,
      skills: splitList(values.skills_text),
      years_of_experience: values.years_of_experience,
      salary_expectation: {
        ...values.salary_expectation,
        currency: values.salary_expectation.currency.toUpperCase(),
      },
      portfolio_url: values.portfolio_url || undefined,
      portfolio_projects: [],
      extracted_text: values.extracted_text,
      video_transcript: values.video_transcript || undefined,
      visible: values.visible,
      archived: values.archived,
      created_at: now,
      updated_at: now,
    });

    setApplications(
      (current) => [nextApplication, ...current.filter((item) => item.candidate_id !== nextApplication.candidate_id)],
      {
        label: "Application created",
        detail: nextApplication.candidate_label,
      },
    );

    toast.success("Application created");
    router.push("/applications");
  });

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Create a new application record</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Add Application</h2>
        </div>
        <Button onClick={goBack} variant="outline">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </section>

      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">Complete the candidate fields, then save to return to the Applications list.</p>
        </CardHeader>
        <CardContent>
          <form className="mx-auto grid w-full max-w-3xl gap-5" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.candidate_label?.message}>
                Candidate label
                <Input {...form.register("candidate_label")} placeholder="Maya R. - Backend engineer" />
              </Label>
              <Label>
                Candidate ID
                <Input {...form.register("candidate_id")} />
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label error={form.formState.errors.skills_text?.message}>
                Skills
                <Input {...form.register("skills_text")} placeholder="Python, FastAPI, PostgreSQL" />
              </Label>
              <Label>
                Years of experience
                <Input min={0} step="0.5" type="number" {...form.register("years_of_experience")} />
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Label error={form.formState.errors.salary_expectation?.currency?.message}>
                Currency
                <Input {...form.register("salary_expectation.currency")} />
              </Label>
              <Label>
                Min salary
                <Input min={0} type="number" {...form.register("salary_expectation.min_amount")} />
              </Label>
              <Label error={form.formState.errors.salary_expectation?.max_amount?.message}>
                Max salary
                <Input min={0} type="number" {...form.register("salary_expectation.max_amount")} />
              </Label>
            </div>
            <Label error={form.formState.errors.portfolio_url?.message}>
              Portfolio URL
              <Input {...form.register("portfolio_url")} placeholder="https://profiles.example.com/candidate" />
            </Label>
            <Label error={form.formState.errors.extracted_text?.message}>
              Extracted text
              <Textarea rows={4} {...form.register("extracted_text")} />
            </Label>
            <Label error={form.formState.errors.video_transcript?.message}>
              Video transcript
              <Textarea rows={3} {...form.register("video_transcript")} />
            </Label>
            <Button disabled={saving} type="submit">
              {saving ? <Spinner /> : <Plus className="h-4 w-4" />}
              Save application
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
