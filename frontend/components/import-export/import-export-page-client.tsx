"use client";

import { FileJson, FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { defaultJobs } from "@/data/default-jobs";
import {
  sampleApplicationsJsonText,
  sampleApplicationsYamlText,
} from "@/data/default-applications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  downloadRecords,
  parseApplicationImport,
  parseJobImport,
  recordsToText,
  type ImportPreview,
} from "@/lib/import-export";
import type { ApplicationRecord, JobRecord } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";

type ImportTab = "jobs-json" | "jobs-yaml" | "applications-json" | "applications-yaml";

type ParsedPreview = {
  tab: ImportTab;
  data: ImportPreview<JobRecord> | ImportPreview<ApplicationRecord>;
};

const tabs: Array<{ key: ImportTab; label: string }> = [
  { key: "jobs-json", label: "Jobs JSON" },
  { key: "jobs-yaml", label: "Jobs YAML" },
  { key: "applications-json", label: "Applications JSON" },
  { key: "applications-yaml", label: "Applications YAML" },
];

export function ImportExportPageClient() {
  const {
    jobs,
    applications,
    setJobs,
    setApplications,
    noteImportedJobs,
    noteImportedApplications,
  } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ImportTab>("jobs-json");
  const [inputText, setInputText] = useState("");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parsing, setParsing] = useState(false);

  const currentFormat = useMemo(() => (activeTab.endsWith("json") ? "json" : "yaml"), [activeTab]);
  const currentEntity = useMemo(() => (activeTab.startsWith("jobs") ? "jobs" : "applications"), [activeTab]);

  function parsePreview() {
    if (!inputText.trim()) {
      toast.error("Paste import content first.");
      return;
    }

    setParsing(true);
    window.setTimeout(() => {
      const parsed =
        currentEntity === "jobs"
          ? parseJobImport(inputText, currentFormat)
          : parseApplicationImport(inputText, currentFormat);

      setPreview({ tab: activeTab, data: parsed });
      setParsing(false);

      if (parsed.syntaxError) {
        toast.error("Import content could not be parsed.");
        return;
      }

      toast.success(`${parsed.valid.length} valid, ${parsed.invalid.length} invalid`);
    }, 120);
  }

  function confirmImport() {
    if (!preview || preview.tab !== activeTab) {
      toast.error("Parse preview before confirming import.");
      return;
    }

    if (!preview.data.valid.length) {
      toast.error("No valid records are ready to import.");
      return;
    }

    if (currentEntity === "jobs") {
      const valid = preview.data.valid as JobRecord[];
      setJobs(
        (current) => {
          const incomingIds = new Set(valid.map((record) => record.job_id));
          return [...valid, ...current.filter((record) => !incomingIds.has(record.job_id))];
        },
        {
          label: "Jobs imported",
          detail: `${valid.length} job${valid.length === 1 ? "" : "s"} imported via ${currentFormat.toUpperCase()}.`,
        },
      );
      noteImportedJobs(valid.length);
      toast.success("Job records imported.");
      return;
    }

    const valid = preview.data.valid as ApplicationRecord[];
    setApplications(
      (current) => {
        const incomingIds = new Set(valid.map((record) => record.candidate_id));
        return [...valid, ...current.filter((record) => !incomingIds.has(record.candidate_id))];
      },
      {
        label: "Applications imported",
        detail: `${valid.length} application${valid.length === 1 ? "" : "s"} imported via ${currentFormat.toUpperCase()}.`,
      },
    );
    noteImportedApplications(valid.length);
    toast.success("Application records imported.");
  }

  function loadSamples() {
    if (currentEntity === "jobs") {
      setInputText(recordsToText(defaultJobs, currentFormat));
      return;
    }

    setInputText(currentFormat === "json" ? sampleApplicationsJsonText : sampleApplicationsYamlText);
  }

  function exportRecords(entity: "jobs" | "applications", format: "json" | "yaml") {
    const records = entity === "jobs" ? jobs : applications;

    if (!records.length) {
      toast.error(`No ${entity} records are available to export.`);
      return;
    }

    const filename = `talentconnect-${entity}.${format === "json" ? "json" : "yaml"}`;
    const content = recordsToText(records, format);

    downloadRecords(
      filename,
      content,
      format === "json" ? "application/json" : "application/yaml",
    );

    toast.success(`${records.length} ${entity} record${records.length === 1 ? "" : "s"} exported.`);
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <p className="text-sm font-medium text-muted-foreground">Dedicated import and export workspace</p>
        <h2 className="text-3xl font-semibold tracking-tight">Import / Export</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Parse, preview, validate, and confirm data imports in one full-page workflow. Export current jobs and applications as JSON or YAML.
        </p>
      </section>

      <Card>
        <CardHeader>
          <div className="inline-flex w-full rounded-md border border-border bg-muted p-1 lg:w-fit">
            {tabs.map((tab) => (
              <button
                className={cn(
                  "rounded px-4 py-2 text-sm font-medium",
                  activeTab === tab.key && "bg-card shadow-sm",
                )}
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPreview(null);
                }}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={loadSamples} size="sm" variant="outline">
              Load sample {currentEntity}
            </Button>
            <Button disabled={!inputText.trim() || parsing} onClick={parsePreview} variant="outline">
              {parsing ? <Spinner /> : <Upload className="h-4 w-4" />}
              Parse preview
            </Button>
            <Button
              disabled={!preview || preview.tab !== activeTab || !preview.data.valid.length || Boolean(preview.data.syntaxError)}
              onClick={confirmImport}
            >
              Confirm import
            </Button>
          </div>

          <Textarea
            className="min-h-[420px] font-mono text-xs"
            onChange={(event) => setInputText(event.target.value)}
            placeholder={
              currentFormat === "json"
                ? currentEntity === "jobs"
                  ? "[{ \"job_id\": \"...\" }]"
                  : "[{ \"candidate_id\": \"...\" }]"
                : currentEntity === "jobs"
                  ? "- job_id: ..."
                  : "- candidate_id: ..."
            }
            value={inputText}
          />

          {preview && preview.tab === activeTab ? (
            <div className="grid gap-4">
              {preview.data.syntaxError ? (
                <div className="rounded-md border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">
                  {preview.data.syntaxError}
                </div>
              ) : (
                <div className="grid gap-3 rounded-md border border-border bg-background p-4 text-sm sm:grid-cols-2">
                  <span>
                    <strong>{preview.data.valid.length}</strong> valid records
                  </span>
                  <span>
                    <strong>{preview.data.invalid.length}</strong> invalid records
                  </span>
                </div>
              )}

              {preview.data.valid.length ? (
                <div className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                    Valid preview
                  </div>
                  <div className="grid divide-y divide-border">
                    {(preview.data.valid as Array<JobRecord | ApplicationRecord>).slice(0, 8).map((record) => (
                      <div className="px-3 py-2 text-sm" key={currentEntity === "jobs" ? (record as JobRecord).job_id : (record as ApplicationRecord).candidate_id}>
                        <strong>{currentEntity === "jobs" ? (record as JobRecord).title : (record as ApplicationRecord).candidate_label}</strong>
                        <span className="ml-2 text-muted-foreground">
                          {currentEntity === "jobs"
                            ? (record as JobRecord).company
                            : (record as ApplicationRecord).skills.slice(0, 3).join(" / ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {preview.data.invalid.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50">
                  <div className="border-b border-amber-200 px-3 py-2 text-xs font-semibold uppercase text-amber-800">
                    Record issues
                  </div>
                  <div className="grid divide-y divide-amber-200">
                    {preview.data.invalid.map((record) => (
                      <div className="grid gap-2 px-3 py-3 text-sm" key={`${record.index}-${record.label}`}>
                        <strong>
                          Row {record.index + 1}: {record.label}
                        </strong>
                        <ul className="grid gap-1 text-amber-900">
                          {record.issues.map((issue) => (
                            <li key={`${issue.field}-${issue.message}`}>
                              {issue.field}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold tracking-tight">Export current datasets</h3>
          <p className="text-sm text-muted-foreground">Download the records currently stored in this browser workspace.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button onClick={() => exportRecords("jobs", "json")} variant="outline">
            <FileJson className="h-4 w-4" />
            Jobs JSON
          </Button>
          <Button onClick={() => exportRecords("jobs", "yaml")} variant="outline">
            <FileText className="h-4 w-4" />
            Jobs YAML
          </Button>
          <Button onClick={() => exportRecords("applications", "json")} variant="outline">
            <FileJson className="h-4 w-4" />
            Applications JSON
          </Button>
          <Button onClick={() => exportRecords("applications", "yaml")} variant="outline">
            <FileText className="h-4 w-4" />
            Applications YAML
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
