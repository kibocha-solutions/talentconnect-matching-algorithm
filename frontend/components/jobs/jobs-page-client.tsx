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
import { defaultJobs } from "@/data/default-jobs";
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
import { formatDateTime, formatExperience, formatSalary } from "@/lib/format";
import {
  downloadRecords,
  recordsToText,
  type ParseFormat,
} from "@/lib/import-export";
import { jobRecordSchema, type JobRecord } from "@/lib/schemas";
import { cn } from "@/lib/utils";
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
type PanelMode = "edit" | null;
type StatusFilter = "active" | "visible" | "hidden" | "archived" | "all";

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

export function JobsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPanel = searchParams.get("panel");
  const { jobs, setJobs } = useWorkspace();
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [detailJob, setDetailJob] = useState<JobRecord | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [saving, setSaving] = useState(false);

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    if (requestedPanel === "create") {
      router.replace("/jobs/new");
    }
    if (requestedPanel === "import") {
      router.replace("/import-export");
    }
  }, [requestedPanel, router]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter === "all") {
        return true;
      }
      if (statusFilter === "archived") {
        return job.archived;
      }
      if (statusFilter === "hidden") {
        return !job.visible && !job.archived;
      }
      if (statusFilter === "visible") {
        return job.visible && !job.archived;
      }
      return !job.archived;
    });
  }, [jobs, statusFilter]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((jobId) => filteredJobs.some((job) => job.job_id === jobId)),
    [filteredJobs, rowSelection],
  );

  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedIds.includes(job.job_id)),
    [jobs, selectedIds],
  );

  const columns = useMemo<ColumnDef<JobRecord>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            aria-label="Select all jobs on this page"
            checked={table.getIsAllPageRowsSelected()}
            className="h-4 w-4 rounded border-border"
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            type="checkbox"
          />
        ),
        cell: ({ row }) => (
          <input
            aria-label={`Select ${row.original.title}`}
            checked={row.getIsSelected()}
            className="h-4 w-4 rounded border-border"
            onChange={row.getToggleSelectedHandler()}
            type="checkbox"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <button
            className="grid max-w-[280px] gap-1 text-left"
            onClick={() => router.push(`/jobs/${row.original.job_id}`)}
            type="button"
          >
            <strong className="truncate font-medium text-foreground">{row.original.title}</strong>
            <span className="truncate text-xs text-muted-foreground">{row.original.company}</span>
          </button>
        ),
      },
      {
        accessorKey: "primary_stack",
        header: "Primary stack",
        cell: ({ row }) => <span className="text-sm">{row.original.primary_stack}</span>,
      },
      {
        accessorKey: "experience_level",
        header: "Level",
        cell: ({ row }) => <Badge variant="outline">{row.original.experience_level}</Badge>,
      },
      {
        accessorFn: (row) => row.salary_offered.min_amount,
        id: "salary",
        header: "Salary",
        cell: ({ row }) => <span className="whitespace-nowrap">{formatSalary(row.original.salary_offered)}</span>,
      },
      {
        accessorKey: "visible",
        header: "Visibility",
        cell: ({ row }) => <VisibilityBadge job={row.original} />,
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.updated_at)}</span>,
      },
    ],
    [router],
  );

  const table = useReactTable({
    data: filteredJobs,
    columns,
    state: { sorting, globalFilter, rowSelection },
    initialState: { pagination: { pageSize: 8 } },
    globalFilterFn: (row, _columnId, filterValue) => {
      const haystack = [
        row.original.title,
        row.original.company,
        row.original.source,
        row.original.primary_stack,
        row.original.experience_level,
        row.original.required_skills.join(" "),
        row.original.job_description_text,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(String(filterValue).toLowerCase());
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.job_id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function openEditPanel(job: JobRecord) {
    setEditingJobId(job.job_id);
    form.reset(toFormValues(job));
    setPanelMode("edit");
    setDetailJob(null);
  }

  function closePanel() {
    setPanelMode(null);
    setEditingJobId(null);
  }

  function saveJob(values: JobFormValues) {
    setSaving(true);
    try {
      const nextJob = toJobRecord(values, editingJobId ? findJob(editingJobId)?.created_at : undefined);
      setJobs(
        (current) => {
          const exists = current.some((job) => job.job_id === nextJob.job_id);
          return exists
            ? current.map((job) => (job.job_id === nextJob.job_id ? nextJob : job))
            : [nextJob, ...current];
        },
        {
          label: editingJobId ? "Job updated" : "Job created",
          detail: `${nextJob.title} at ${nextJob.company}`,
        },
      );
      toast.success(editingJobId ? "Job updated" : "Job created");
      closePanel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Job could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function findJob(jobId: string) {
    return jobs.find((job) => job.job_id === jobId);
  }

  function setVisibility(ids: string[], visible: boolean) {
    setJobs(
      (current) =>
        current.map((job) =>
          ids.includes(job.job_id)
            ? { ...job, visible, archived: visible ? false : job.archived, updated_at: new Date().toISOString() }
            : job,
        ),
      {
        label: visible ? "Jobs shown" : "Jobs hidden",
        detail: `${ids.length} job${ids.length === 1 ? "" : "s"} updated.`,
      },
    );
    setRowSelection({});
    toast.success(visible ? "Jobs shown" : "Jobs hidden");
  }

  function archiveJobs(ids: string[]) {
    setJobs(
      (current) =>
        current.map((job) =>
          ids.includes(job.job_id)
            ? { ...job, archived: true, visible: false, updated_at: new Date().toISOString() }
            : job,
        ),
      {
        label: "Jobs archived",
        detail: `${ids.length} job${ids.length === 1 ? "" : "s"} moved out of active review.`,
      },
    );
    setRowSelection({});
    toast.success("Jobs archived");
  }

  function deleteJobs(ids: string[]) {
    setJobs(
      (current) => current.filter((job) => !ids.includes(job.job_id)),
      {
        label: "Jobs deleted",
        detail: `${ids.length} job${ids.length === 1 ? "" : "s"} removed from the workspace.`,
      },
    );
    setRowSelection({});
    setDetailJob(null);
    toast.success("Jobs deleted");
  }

  function restoreDefaults() {
    setJobs(defaultJobs, {
      label: "Seeded jobs restored",
      detail: "15 backend-oriented jobs are available.",
    });
    setRowSelection({});
    toast.success("Seeded jobs restored");
  }

  function exportJobs(records: JobRecord[], format: ParseFormat) {
    if (!records.length) {
      toast.error("There are no job records to export.");
      return;
    }

    const content = recordsToText(records, format);
    downloadRecords(
      format === "json" ? "talentconnect-jobs.json" : "talentconnect-jobs.yaml",
      content,
      format === "json" ? "application/json" : "application/yaml",
    );
    toast.success(`${records.length} job${records.length === 1 ? "" : "s"} exported`);
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Manage job postings</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Jobs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review compact job rows, open details when needed, and import or export controlled record sets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/jobs/new")}>
            <Plus className="h-4 w-4" />
            Add job
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
                placeholder="Search title, company, stack, skills, or description"
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
              <Button onClick={() => exportJobs(jobs, "json")} variant="outline">
                <FileJson className="h-4 w-4" />
                JSON
              </Button>
              <Button onClick={() => exportJobs(jobs, "yaml")} variant="outline">
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
              <Button onClick={() => archiveJobs(selectedIds)} size="sm" variant="outline">
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <Button onClick={() => exportJobs(selectedJobs, "json")} size="sm" variant="outline">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button onClick={() => deleteJobs(selectedIds)} size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {filteredJobs.length ? (
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
                                className={cn("flex items-center gap-1", header.column.getCanSort() && "cursor-pointer")}
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
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {table.getRowModel().rows.map((row) => (
                  <article className="rounded-md border border-border bg-background p-4" key={row.original.job_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button className="text-left" onClick={() => router.push(`/jobs/${row.original.job_id}`)} type="button">
                          <strong className="block truncate">{row.original.title}</strong>
                          <span className="mt-1 block text-sm text-muted-foreground">{row.original.company}</span>
                        </button>
                      </div>
                      <input
                        aria-label={`Select ${row.original.title}`}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        type="checkbox"
                      />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      <span>{row.original.primary_stack}</span>
                      <span>{formatExperience(row.original.experience_range)}</span>
                      <span>{formatSalary(row.original.salary_offered)}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <VisibilityBadge job={row.original} />
                      <span className="text-xs text-muted-foreground">{formatDateTime(row.original.updated_at)}</span>
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
              <h3 className="font-medium">No jobs match this view</h3>
              <p className="mt-2 text-sm text-muted-foreground">Adjust the search or status filter, create a job, or import records.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        description="Create or update one job record."
        onOpenChange={(open) => {
          if (!open) {
            closePanel();
          }
        }}
        open={panelMode === "edit"}
        title="Edit job"
      >
        <JobForm form={form} onSubmit={saveJob} saving={saving} />
      </Sheet>

      <Sheet
        description="Full job record, metadata, and raw structured view."
        onOpenChange={(open) => {
          if (!open) {
            setDetailJob(null);
          }
        }}
        open={Boolean(detailJob)}
        title={detailJob?.title ?? "Job details"}
      >
        {detailJob ? (
          <JobDetails
            archiveJob={() => archiveJobs([detailJob.job_id])}
            deleteJob={() => deleteJobs([detailJob.job_id])}
            editJob={() => openEditPanel(detailJob)}
            job={detailJob}
            toggleVisibility={() => setVisibility([detailJob.job_id], !detailJob.visible)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function JobForm({
  form,
  onSubmit,
  saving,
}: {
  form: ReturnType<typeof useForm<JobFormValues>>;
  onSubmit: (values: JobFormValues) => void;
  saving: boolean;
}) {
  return (
    <form className="mx-auto grid w-full max-w-2xl gap-5" onSubmit={form.handleSubmit(onSubmit)}>
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
  );
}

function JobDetails({
  job,
  editJob,
  toggleVisibility,
  archiveJob,
  deleteJob,
}: {
  job: JobRecord;
  editJob: () => void;
  toggleVisibility: () => void;
  archiveJob: () => void;
  deleteJob: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={editJob} variant="outline">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button onClick={toggleVisibility} variant="outline">
          {job.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {job.visible ? "Hide" : "Show"}
        </Button>
        <Button onClick={archiveJob} variant="outline">
          <Archive className="h-4 w-4" />
          Archive
        </Button>
        <Button onClick={deleteJob} variant="destructive">
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
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
      <div>
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">Raw structured view</h3>
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(job, null, 2)}
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

function VisibilityBadge({ job }: { job: JobRecord }) {
  if (job.archived) {
    return <Badge variant="secondary">Archived</Badge>;
  }
  return job.visible ? <Badge variant="success">Visible</Badge> : <Badge variant="warning">Hidden</Badge>;
}

function toFormValues(job: JobRecord): JobFormValues {
  return {
    ...job,
    required_skills_text: job.required_skills.join(", "),
    nice_to_have_skills_text: job.nice_to_have_skills.join(", "),
  };
}

function toJobRecord(values: JobFormValues, createdAt?: string): JobRecord {
  const now = new Date().toISOString();
  return jobRecordSchema.parse({
    ...values,
    required_skills: splitList(values.required_skills_text),
    nice_to_have_skills: splitList(values.nice_to_have_skills_text),
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
