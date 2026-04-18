import { z } from "zod";

const uuidSchema = z.string().uuid();
const textSchema = z.string().trim().min(1);
const longTextSchema = z.string().trim().min(40);
const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const salaryRangeSchema = z
  .object({
    currency: currencySchema,
    min_amount: z.coerce.number().nonnegative(),
    max_amount: z.coerce.number().nonnegative(),
  })
  .refine((value) => value.max_amount >= value.min_amount, {
    message: "Maximum salary must be greater than or equal to minimum salary.",
    path: ["max_amount"],
  });

export const experienceRangeSchema = z
  .object({
    min_years: z.coerce.number().nonnegative(),
    max_years: z.coerce.number().nonnegative(),
  })
  .refine((value) => value.max_years >= value.min_years, {
    message: "Maximum experience must be greater than or equal to minimum experience.",
    path: ["max_years"],
  });

export const jobPayloadSchema = z.object({
  job_id: uuidSchema,
  employer_id: uuidSchema,
  required_skills: z.array(textSchema).min(1),
  nice_to_have_skills: z.array(textSchema).default([]),
  experience_range: experienceRangeSchema,
  salary_offered: salaryRangeSchema,
  job_description_text: longTextSchema,
  portfolio_required: z.boolean().default(false),
});

export const jobRecordSchema = jobPayloadSchema.extend({
  title: textSchema,
  company: textSchema,
  source: textSchema.default("Direct"),
  primary_stack: textSchema,
  experience_level: textSchema,
  visible: z.boolean().default(true),
  archived: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  imported_at: z.string().datetime().optional(),
});

export const portfolioProjectSchema = z.object({
  title: textSchema,
  description: z.string().trim().min(20),
  url: z.string().url().optional(),
  technologies: z.array(textSchema).default([]),
});

export const candidatePayloadSchema = z.object({
  candidate_id: uuidSchema,
  skills: z.array(textSchema).min(1),
  years_of_experience: z.coerce.number().nonnegative(),
  salary_expectation: salaryRangeSchema,
  portfolio_url: z.string().url().optional(),
  portfolio_projects: z.array(portfolioProjectSchema).default([]),
  extracted_text: z.string().trim().min(40),
  video_transcript: z.string().trim().min(20).optional(),
});

export const applicationRecordSchema = candidatePayloadSchema.extend({
  candidate_label: textSchema,
  visible: z.boolean().default(true),
  archived: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  imported_at: z.string().datetime().optional(),
});

export type JobPayload = z.infer<typeof jobPayloadSchema>;
export type CandidatePayload = z.infer<typeof candidatePayloadSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;

export function toJobPayload(job: JobRecord): JobPayload {
  return jobPayloadSchema.parse({
    job_id: job.job_id,
    employer_id: job.employer_id,
    required_skills: job.required_skills,
    nice_to_have_skills: job.nice_to_have_skills,
    experience_range: job.experience_range,
    salary_offered: job.salary_offered,
    job_description_text: job.job_description_text,
    portfolio_required: job.portfolio_required,
  });
}

export function toCandidatePayload(application: ApplicationRecord): CandidatePayload {
  return candidatePayloadSchema.parse({
    candidate_id: application.candidate_id,
    skills: application.skills,
    years_of_experience: application.years_of_experience,
    salary_expectation: application.salary_expectation,
    portfolio_url: application.portfolio_url,
    portfolio_projects: application.portfolio_projects,
    extracted_text: application.extracted_text,
    video_transcript: application.video_transcript,
  });
}

export function normalizeJobRecord(rawRecord: unknown, importedAt?: string) {
  const payload = jobPayloadSchema.parse(rawRecord);
  const raw = rawRecord && typeof rawRecord === "object" ? (rawRecord as Record<string, unknown>) : {};
  const now = new Date().toISOString();
  const requiredStack = payload.required_skills.slice(0, 3).join(" / ");
  const maxYears = payload.experience_range.max_years;

  return jobRecordSchema.parse({
    ...payload,
    title: readText(raw.title) ?? `${payload.required_skills[0]} Backend Engineer`,
    company: readText(raw.company) ?? readText(raw.source) ?? "Imported source",
    source: readText(raw.source) ?? "Imported",
    primary_stack: readText(raw.primary_stack) ?? requiredStack,
    experience_level: readText(raw.experience_level) ?? inferExperienceLevel(maxYears),
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    archived: typeof raw.archived === "boolean" ? raw.archived : false,
    created_at: readDate(raw.created_at) ?? importedAt ?? now,
    updated_at: readDate(raw.updated_at) ?? importedAt ?? now,
    imported_at: importedAt,
  });
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDate(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function inferExperienceLevel(maxYears: number) {
  if (maxYears <= 3) {
    return "Early";
  }
  if (maxYears <= 6) {
    return "Mid";
  }
  if (maxYears <= 9) {
    return "Senior";
  }
  return "Staff";
}

export function normalizeApplicationRecord(rawRecord: unknown, importedAt?: string) {
  const payload = candidatePayloadSchema.parse(rawRecord);
  const raw = rawRecord && typeof rawRecord === "object" ? (rawRecord as Record<string, unknown>) : {};
  const now = new Date().toISOString();
  const labelFromRaw = readText(raw.candidate_label);
  const labelFromPortfolio = readText(raw.portfolio_url)?.replace(/^https?:\/\//, "");

  return applicationRecordSchema.parse({
    ...payload,
    candidate_label: labelFromRaw ?? labelFromPortfolio ?? `Candidate ${String(payload.candidate_id).slice(0, 8)}`,
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    archived: typeof raw.archived === "boolean" ? raw.archived : false,
    created_at: readDate(raw.created_at) ?? importedAt ?? now,
    updated_at: readDate(raw.updated_at) ?? importedAt ?? now,
    imported_at: importedAt,
  });
}
