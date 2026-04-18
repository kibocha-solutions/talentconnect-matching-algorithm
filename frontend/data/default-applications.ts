import seededJsonRecords from "@/src/data/default-applications.json";
import { recordsToText } from "@/lib/import-export";
import {
  normalizeApplicationRecord,
  type ApplicationRecord,
} from "@/lib/schemas";

const supplementalValidRecords: unknown[] = [
  {
    candidate_id: "32000000-0000-4000-8000-000000000001",
    candidate_label: "Data pipeline backend engineer",
    skills: ["Python", "ETL", "PostgreSQL", "Airflow"],
    years_of_experience: 4,
    salary_expectation: {
      currency: "USD",
      min_amount: 84000,
      max_amount: 112000,
    },
    portfolio_projects: [],
    extracted_text:
      "Backend data engineer with Python ETL, PostgreSQL models, Airflow schedules, validation checks, and reporting data flows.",
    video_transcript:
      "I build dependable data preparation jobs that help matching teams work from clean structured inputs.",
    visible: true,
    archived: false,
  },
  {
    candidate_id: "32000000-0000-4000-8000-000000000002",
    candidate_label: "Kotlin services engineer",
    skills: ["Kotlin", "Spring", "Kafka", "AWS"],
    years_of_experience: 5,
    salary_expectation: {
      currency: "USD",
      min_amount: 110000,
      max_amount: 142000,
    },
    portfolio_projects: [],
    extracted_text:
      "Kotlin backend engineer with Spring services, Kafka event messaging, AWS deployments, and recruiter workflow APIs.",
    video_transcript:
      "I have built microservices that connect product workflows with reliable backend event processing.",
    visible: true,
    archived: false,
  },
];

const seededImportDate = "2026-04-17T08:00:00.000Z";

export const defaultApplications: ApplicationRecord[] = [
  ...toValidRecords(seededJsonRecords as unknown[]),
  ...toValidRecords(supplementalValidRecords),
].slice(0, 15);

export const sampleApplicationsJsonText = JSON.stringify(seededJsonRecords, null, 2);

export const sampleApplicationsYamlText = recordsToText(
  seededJsonRecords as unknown as Record<string, unknown>[],
  "yaml",
);

function toValidRecords(records: unknown[]): ApplicationRecord[] {
  return records
    .map((record) => {
      try {
        return normalizeApplicationRecord(record, seededImportDate);
      } catch {
        return null;
      }
    })
    .filter((record): record is ApplicationRecord => Boolean(record));
}
