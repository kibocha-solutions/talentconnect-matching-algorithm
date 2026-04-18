"use client";

import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  defaultApplications,
} from "@/data/default-applications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatSalary } from "@/lib/format";
import {
  downloadRecords,
  recordsToText,
  type ParseFormat,
} from "@/lib/import-export";
import { applicationRecordSchema, type ApplicationRecord } from "@/lib/schemas";
import { cn } from "@/lib/utils";
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
type PanelMode = "edit" | null;
type StatusFilter = "active" | "visible" | "hidden" | "archived" | "all";

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

export function ApplicationsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPanel = searchParams.get("panel");
  const {
    applications,
    setApplications,
  } = useWorkspace();
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [detailApplication, setDetailApplication] = useState<ApplicationRecord | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [saving, setSaving] = useState(false);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    if (requestedPanel === "create") {
      router.replace("/applications/new");
    }
    if (requestedPanel === "import") {
      router.replace("/import-export");
    }
  }, [requestedPanel, router]);

  const filteredApplications = useMemo(() => {
    return applications.filter((application) => {
      if (statusFilter === "all") {
        return true;
      }
      if (statusFilter === "archived") {
        return application.archived;
      }
      if (statusFilter === "hidden") {
        return !application.visible && !application.archived;
      }
      if (statusFilter === "visible") {
        return application.visible && !application.archived;
      }
      return !application.archived;
    });
  }, [applications, statusFilter]);

  const selectedIds = useMemo(
    () =>
      Object.keys(rowSelection).filter((candidateId) =>
        filteredApplications.some((application) => application.candidate_id === candidateId),
      ),
    [filteredApplications, rowSelection],
  );

  const selectedApplications = useMemo(
    () => applications.filter((application) => selectedIds.includes(application.candidate_id)),
    [applications, selectedIds],
  );

  const columns = useMemo<ColumnDef<ApplicationRecord>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            aria-label="Select all applications on this page"
            checked={table.getIsAllPageRowsSelected()}
            className="h-4 w-4 rounded border-border"
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            type="checkbox"
          />
        ),
        cell: ({ row }) => (
          <input
            aria-label={`Select ${row.original.candidate_label}`}
            checked={row.getIsSelected()}
            className="h-4 w-4 rounded border-border"
            onChange={row.getToggleSelectedHandler()}
            type="checkbox"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "candidate_label",
        header: "Candidate",
        cell: ({ row }) => (
          <button
            className="grid max-w-[280px] gap-1 text-left"
            onClick={() => router.push(`/applications/${row.original.candidate_id}`)}
            type="button"
          >
            <strong className="truncate font-medium text-foreground">{row.original.candidate_label}</strong>
            <span className="truncate text-xs text-muted-foreground">{truncateId(row.original.candidate_id)}</span>
          </button>
        ),
      },
      {
        accessorFn: (row) => row.skills.join(", "),
        id: "skills",
        header: "Primary skills",
        cell: ({ row }) => <span className="text-sm">{row.original.skills.slice(0, 3).join(" / ")}</span>,
      },
      {
        accessorKey: "years_of_experience",
        header: "Experience",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.years_of_experience} yrs</span>,
      },
      {
        accessorFn: (row) => row.salary_expectation.min_amount,
        id: "salary",
        header: "Salary expectation",
        cell: ({ row }) => <span className="whitespace-nowrap">{formatSalary(row.original.salary_expectation)}</span>,
      },
      {
        id: "portfolio",
        header: "Portfolio",
        cell: ({ row }) => <PortfolioBadge application={row.original} />,
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.updated_at)}</span>
        ),
      },
    ],
    [router],
  );

  const table = useReactTable({
    data: filteredApplications,
    columns,
    state: { sorting, globalFilter, rowSelection },
    initialState: { pagination: { pageSize: 8 } },
    globalFilterFn: (row, _columnId, filterValue) => {
      const haystack = [
        row.original.candidate_label,
        row.original.skills.join(" "),
        row.original.extracted_text,
        row.original.video_transcript ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(String(filterValue).toLowerCase());
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.candidate_id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function openEditPanel(application: ApplicationRecord) {
    setEditingCandidateId(application.candidate_id);
    form.reset(toFormValues(application));
    setPanelMode("edit");
    setDetailApplication(null);
  }

  function closePanel() {
    setPanelMode(null);
    setEditingCandidateId(null);
  }

  function findApplication(candidateId: string) {
    return applications.find((application) => application.candidate_id === candidateId);
  }

  function saveApplication(values: ApplicationFormValues) {
    setSaving(true);
    try {
      const nextApplication = toApplicationRecord(
        values,
        editingCandidateId ? findApplication(editingCandidateId)?.created_at : undefined,
      );

      setApplications(
        (current) => {
          const exists = current.some((application) => application.candidate_id === nextApplication.candidate_id);
          return exists
            ? current.map((application) =>
                application.candidate_id === nextApplication.candidate_id ? nextApplication : application,
              )
            : [nextApplication, ...current];
        },
        {
          label: editingCandidateId ? "Application updated" : "Application created",
          detail: nextApplication.candidate_label,
        },
      );

      toast.success(editingCandidateId ? "Application updated" : "Application created");
      closePanel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Application could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function setVisibility(ids: string[], visible: boolean) {
    setApplications(
      (current) =>
        current.map((application) =>
          ids.includes(application.candidate_id)
            ? {
                ...application,
                visible,
                archived: visible ? false : application.archived,
                updated_at: new Date().toISOString(),
              }
            : application,
        ),
      {
        label: visible ? "Applications shown" : "Applications hidden",
        detail: `${ids.length} application${ids.length === 1 ? "" : "s"} updated.`,
      },
    );
    setRowSelection({});
    toast.success(visible ? "Applications shown" : "Applications hidden");
  }

  function archiveApplications(ids: string[]) {
    setApplications(
      (current) =>
        current.map((application) =>
          ids.includes(application.candidate_id)
            ? {
                ...application,
                archived: true,
                visible: false,
                updated_at: new Date().toISOString(),
              }
            : application,
        ),
      {
        label: "Applications archived",
        detail: `${ids.length} application${ids.length === 1 ? "" : "s"} moved out of active review.`,
      },
    );
    setRowSelection({});
    toast.success("Applications archived");
  }

  function deleteApplications(ids: string[]) {
    setApplications(
      (current) => current.filter((application) => !ids.includes(application.candidate_id)),
      {
        label: "Applications deleted",
        detail: `${ids.length} application${ids.length === 1 ? "" : "s"} removed from the workspace.`,
      },
    );
    setRowSelection({});
    setDetailApplication(null);
    toast.success("Applications deleted");
  }

  function restoreDefaults() {
    setApplications(defaultApplications, {
      label: "Seeded applications restored",
      detail: "15 realistic application records are available.",
    });
    setRowSelection({});
    toast.success("Seeded applications restored");
  }

  function exportApplications(records: ApplicationRecord[], format: ParseFormat) {
    if (!records.length) {
      toast.error("There are no application records to export.");
      return;
    }

    const content = recordsToText(records, format);
    downloadRecords(
      format === "json" ? "talentconnect-applications.json" : "talentconnect-applications.yaml",
      content,
      format === "json" ? "application/json" : "application/yaml",
    );
    toast.success(`${records.length} application${records.length === 1 ? "" : "s"} exported`);
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Manage candidate records</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Applications</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep the table compact, open full records in details, and import through parse, preview, validate, then
            confirm.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/applications/new")}>
            <Plus className="h-4 w-4" />
            Add application
          </Button>
          <Button onClick={() => router.push("/import-export")} variant="outline">
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="Search candidate, skills, or extracted text"
                value={globalFilter}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                value={statusFilter}
              >
                <option value="active">Active</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
              <Button onClick={() => exportApplications(applications, "json")} variant="outline">
                <FileJson className="h-4 w-4" />
                JSON
              </Button>
              <Button onClick={() => exportApplications(applications, "yaml")} variant="outline">
                <FileText className="h-4 w-4" />
                YAML
              </Button>
              <Button onClick={restoreDefaults} variant="ghost">
                <RotateCcw className="h-4 w-4" />
                Defaults
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm">
            <span className="text-muted-foreground">Selection tools</span>
            <Button onClick={() => table.toggleAllPageRowsSelected(true)} size="sm" variant="outline">
              Select page
            </Button>
            <Button onClick={() => table.toggleAllPageRowsSelected(false)} size="sm" variant="outline">
              Clear page
            </Button>
            <Button onClick={() => setRowSelection({})} size="sm" variant="outline">
              Clear all
            </Button>
          </div>

          {selectedIds.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2">
              <strong className="mr-2 text-sm">{selectedIds.length} selected</strong>
              <Button onClick={() => setVisibility(selectedIds, true)} size="sm" variant="outline">
                <Eye className="h-4 w-4" />
                Show
              </Button>
              <Button onClick={() => setVisibility(selectedIds, false)} size="sm" variant="outline">
                <EyeOff className="h-4 w-4" />
                Hide
              </Button>
              <Button onClick={() => archiveApplications(selectedIds)} size="sm" variant="outline">
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <Button onClick={() => exportApplications(selectedApplications, "json")} size="sm" variant="outline">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button onClick={() => deleteApplications(selectedIds)} size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {filteredApplications.length ? (
            <>
              <div className="hidden overflow-x-auto rounded-md border border-border md:block">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder ? null : (
                              <button
                                className={cn(
                                  "flex items-center gap-1",
                                  header.column.getCanSort() && "cursor-pointer",
                                )}
                                onClick={header.column.getToggleSortingHandler()}
                                type="button"
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {header.column.getIsSorted() === "asc" ? "↑" : null}
                                {header.column.getIsSorted() === "desc" ? "↓" : null}
                              </button>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {table.getRowModel().rows.map((row) => (
                  <article className="rounded-md border border-border bg-background p-4" key={row.original.candidate_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button className="text-left" onClick={() => router.push(`/applications/${row.original.candidate_id}`)} type="button">
                          <strong className="block truncate">{row.original.candidate_label}</strong>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {row.original.skills.slice(0, 3).join(" / ")}
                          </span>
                        </button>
                      </div>
                      <input
                        aria-label={`Select ${row.original.candidate_label}`}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        type="checkbox"
                      />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      <span>{row.original.years_of_experience} yrs</span>
                      <span>{formatSalary(row.original.salary_expectation)}</span>
                      <span>{formatDateTime(row.original.updated_at)}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <PortfolioBadge application={row.original} />
                      <VisibilityBadge application={row.original} />
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
                </span>
                <div className="flex gap-2">
                  <Button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} variant="outline">
                    Previous
                  </Button>
                  <Button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} variant="outline">
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <h3 className="font-medium">No applications match this view</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Adjust search or status filters, create an application, or import records.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        description={
          "Create or update one application record."
        }
        onOpenChange={(open) => {
          if (!open) {
            closePanel();
          }
        }}
        open={panelMode === "edit"}
        title="Edit application"
      >
        <ApplicationForm form={form} onSubmit={saveApplication} saving={saving} />
      </Sheet>

      <Sheet
        description="Full candidate record, metadata, and raw structured view."
        onOpenChange={(open) => {
          if (!open) {
            setDetailApplication(null);
          }
        }}
        open={Boolean(detailApplication)}
        title={detailApplication?.candidate_label ?? "Application details"}
      >
        {detailApplication ? (
          <ApplicationDetails
            application={detailApplication}
            archiveApplication={() => archiveApplications([detailApplication.candidate_id])}
            deleteApplication={() => deleteApplications([detailApplication.candidate_id])}
            editApplication={() => openEditPanel(detailApplication)}
            toggleVisibility={() => setVisibility([detailApplication.candidate_id], !detailApplication.visible)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function ApplicationForm({
  form,
  onSubmit,
  saving,
}: {
  form: ReturnType<typeof useForm<ApplicationFormValues>>;
  onSubmit: (values: ApplicationFormValues) => void;
  saving: boolean;
}) {
  return (
    <form className="mx-auto grid w-full max-w-2xl gap-5" onSubmit={form.handleSubmit(onSubmit)}>
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
  );
}

function ApplicationDetails({
  application,
  editApplication,
  toggleVisibility,
  archiveApplication,
  deleteApplication,
}: {
  application: ApplicationRecord;
  editApplication: () => void;
  toggleVisibility: () => void;
  archiveApplication: () => void;
  deleteApplication: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={editApplication} variant="outline">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button onClick={toggleVisibility} variant="outline">
          {application.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {application.visible ? "Hide" : "Show"}
        </Button>
        <Button onClick={archiveApplication} variant="outline">
          <Archive className="h-4 w-4" />
          Archive
        </Button>
        <Button onClick={deleteApplication} variant="destructive">
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="Candidate" value={application.candidate_label} />
        <DetailItem label="Experience" value={`${application.years_of_experience} yrs`} />
        <DetailItem label="Salary expectation" value={formatSalary(application.salary_expectation)} />
        <DetailItem label="Updated" value={formatDateTime(application.updated_at)} />
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

      <div>
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">Raw structured view</h3>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(application, null, 2)}
        </pre>
      </div>
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

function PortfolioBadge({ application }: { application: ApplicationRecord }) {
  const hasPortfolio = Boolean(application.portfolio_url) || application.portfolio_projects.length > 0;
  return (
    <Badge className="h-6 whitespace-nowrap px-2 text-[11px]" variant={hasPortfolio ? "success" : "secondary"}>
      {hasPortfolio ? "Portfolio" : "No portfolio"}
    </Badge>
  );
}

function VisibilityBadge({ application }: { application: ApplicationRecord }) {
  if (application.archived) {
    return <Badge variant="secondary">Archived</Badge>;
  }
  return application.visible ? <Badge variant="success">Visible</Badge> : <Badge variant="warning">Hidden</Badge>;
}

function toFormValues(application: ApplicationRecord): ApplicationFormValues {
  return {
    candidate_id: application.candidate_id,
    candidate_label: application.candidate_label,
    skills_text: application.skills.join(", "),
    years_of_experience: application.years_of_experience,
    salary_expectation: application.salary_expectation,
    portfolio_url: application.portfolio_url ?? "",
    extracted_text: application.extracted_text,
    video_transcript: application.video_transcript ?? "",
    visible: application.visible,
    archived: application.archived,
  };
}

function toApplicationRecord(values: ApplicationFormValues, createdAt?: string): ApplicationRecord {
  const now = new Date().toISOString();
  return applicationRecordSchema.parse({
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
    created_at: createdAt ?? now,
    updated_at: now,
  });
}

function splitList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function truncateId(value: string) {
  return `${value.slice(0, 8)}...`;
}
