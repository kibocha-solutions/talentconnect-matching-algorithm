import YAML from "yaml";
import { ZodError } from "zod";
import {
  type ApplicationRecord,
  type JobRecord,
  normalizeApplicationRecord,
  normalizeJobRecord,
} from "@/lib/schemas";

export type ParseFormat = "json" | "yaml";

export type ImportIssue = {
  field: string;
  message: string;
};

export type InvalidImportRecord = {
  index: number;
  label: string;
  issues: ImportIssue[];
};

export type ImportPreview<T> = {
  valid: T[];
  invalid: InvalidImportRecord[];
  syntaxError?: string;
};

export function parseJobImport(text: string, format: ParseFormat): ImportPreview<JobRecord> {
  return parseRecords(text, format, normalizeJobRecord);
}

export function parseApplicationImport(text: string, format: ParseFormat): ImportPreview<ApplicationRecord> {
  return parseRecords(text, format, normalizeApplicationRecord);
}

function parseRecords<T>(
  text: string,
  format: ParseFormat,
  normalizer: (rawRecord: unknown, importedAt?: string) => T,
): ImportPreview<T> {
  let parsed: unknown;

  try {
    parsed = format === "json" ? JSON.parse(text) : YAML.parse(text);
  } catch (error) {
    return {
      valid: [],
      invalid: [],
      syntaxError: error instanceof Error ? error.message : "The input could not be parsed.",
    };
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  const importedAt = new Date().toISOString();
  const valid: T[] = [];
  const invalid: InvalidImportRecord[] = [];

  records.forEach((record, index) => {
    try {
      valid.push(normalizer(record, importedAt));
    } catch (error) {
      invalid.push({
        index,
        label: getRecordLabel(record, index),
        issues: normalizeError(error),
      });
    }
  });

  return { valid, invalid };
}

export function recordsToText(records: unknown[], format: ParseFormat) {
  if (format === "json") {
    return JSON.stringify(records, null, 2);
  }
  return YAML.stringify(records);
}

export function downloadRecords(filename: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getRecordLabel(record: unknown, index: number) {
  if (record && typeof record === "object") {
    const value = record as Record<string, unknown>;
    for (const key of ["title", "candidate_label", "job_id", "candidate_id", "company", "source"]) {
      if (typeof value[key] === "string" && value[key]) {
        return value[key];
      }
    }
  }
  return `Record ${index + 1}`;
}

function normalizeError(error: unknown): ImportIssue[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      field: issue.path.join(".") || "record",
      message: issue.message,
    }));
  }

  return [
    {
      field: "record",
      message: error instanceof Error ? error.message : "Record failed validation.",
    },
  ];
}
