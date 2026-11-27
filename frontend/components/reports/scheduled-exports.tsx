"use client";

import {
  CalendarClock,
  Download,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  normalizeClass,
  normalizeCourse,
  normalizeDepartment,
  normalizePaginated,
  normalizeProfessorOption,
  normalizeScheduledExport,
  normalizeScheduledExportRun,
} from "@/lib/normalize";
import type {
  AttendanceMethod,
  AttendanceStatus,
  ProfessorOption,
  ReportFilter,
  ScheduledExport,
  ScheduledExportRun,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface ScheduledExportsProps {
  scope: "admin" | "professor";
  currentFilters: ReportFilter;
}

type ExportFormat = "xlsx" | "pdf";
type ExportFrequency = "daily" | "weekly" | "monthly";

interface ScheduleForm {
  name: string;
  format: ExportFormat;
  frequency: ExportFrequency;
  is_active: boolean;
  period: string;
  department_id: string;
  course_id: string;
  professor_id: string;
  status: AttendanceStatus | "";
  method: AttendanceMethod | "";
  from_date: string;
  to_date: string;
  class_id: string;
}

const PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "course",
  "student",
  "professor",
  "department",
];
const STATUSES = ["present", "late", "absent", "excused"] as const;
const METHODS = ["qr", "face", "manual"] as const;
const FORMATS = ["xlsx", "pdf"] as const;
const FREQUENCIES = ["daily", "weekly", "monthly"] as const;

function asDateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function describeFilter(filter: ReportFilter): string {
  const parts: string[] = [];
  if (filter.period) parts.push(`Period: ${filter.period}`);
  if (filter.from_date) parts.push(`From: ${asDateInput(filter.from_date)}`);
  if (filter.to_date) parts.push(`To: ${asDateInput(filter.to_date)}`);
  if (filter.department_id) parts.push(`Department: ${filter.department_id}`);
  if (filter.course_id) parts.push(`Course: ${filter.course_id}`);
  if (filter.class_id) parts.push(`Class: ${filter.class_id}`);
  if (filter.professor_id) parts.push(`Professor: ${filter.professor_id}`);
  if (filter.status) parts.push(`Status: ${filter.status}`);
  if (filter.method) parts.push(`Method: ${filter.method}`);
  return parts.join(" · ");
}

function createForm(
  name: string,
  format: ExportFormat,
  frequency: ExportFrequency,
  isActive: boolean,
  filter: ReportFilter,
): ScheduleForm {
  return {
    name,
    format,
    frequency,
    is_active: isActive,
    period:
      filter.period && (PERIODS as readonly string[]).includes(filter.period)
        ? filter.period
        : "weekly",
    department_id: filter.department_id ?? "",
    course_id: filter.course_id ?? "",
    class_id: filter.class_id ?? "",
    professor_id: filter.professor_id ?? "",
    status: filter.status ?? "",
    method: filter.method ?? "",
    from_date: asDateInput(filter.from_date),
    to_date: asDateInput(filter.to_date),
  };
}

function filterFromForm(form: ScheduleForm): ReportFilter {
  return {
    period: form.period,
    department_id: form.department_id || null,
    course_id: form.course_id || null,
    class_id: form.class_id || null,
    professor_id: form.professor_id || null,
    status: form.status || null,
    method: form.method || null,
    from_date: form.from_date || null,
    to_date: form.to_date || null,
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScheduledExports({ scope, currentFilters }: ScheduledExportsProps) {
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [runsPage, setRunsPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledExport | null>(null);
  const [form, setForm] = useState<ScheduleForm>(() =>
    createForm("", "xlsx", "weekly", true, {}),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledExport | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filters = useMemo(() => currentFilters, [currentFilters]);

  const schedulesLoader = useCallback(
    () =>
      api
        .get<unknown>("/reports/scheduled-exports")
        .then((payload) => normalizePaginated(payload, normalizeScheduledExport).items),
    [],
  );
  const optionsLoader = useCallback(async () => {
    const [departments, courses, classes, professors] = await Promise.all([
      api.getAll("/departments", normalizeDepartment),
      api.getAll("/courses", normalizeCourse),
      api.getAll(
        scope === "admin" ? "/admin/classes" : "/professor/classes",
        normalizeClass,
      ),
      scope === "admin"
        ? api.getAll("/admin/professors", normalizeProfessorOption)
        : Promise.resolve([] as ProfessorOption[]),
    ]);
    return { departments, courses, classes, professors };
  }, [scope]);
  const runsLoader = useCallback(
    () =>
      api
        .get<unknown>("/reports/scheduled-exports/runs", {
          query: {
            schedule_id: selectedScheduleId,
            page: runsPage,
            page_size: 10,
          },
        })
        .then((payload) => normalizePaginated(payload, normalizeScheduledExportRun)),
    [runsPage, selectedScheduleId],
  );

  const schedules = useResource(schedulesLoader);
  const options = useResource(optionsLoader);
  const runs = useResource(runsLoader, Boolean(selectedScheduleId));

  const scheduleList = useMemo(() => schedules.data ?? [], [schedules.data]);

  useEffect(() => {
    if (selectedScheduleId) return;
    const first = scheduleList[0];
    if (first) setSelectedScheduleId(first.id);
  }, [scheduleList, selectedScheduleId]);

  useEffect(() => {
    setRunsPage(1);
  }, [selectedScheduleId]);

  useEffect(() => {
    if (runs.data && runsPage > Math.max(1, runs.data.pages)) {
      setRunsPage(Math.max(1, runs.data.pages));
    }
  }, [runs.data, runsPage]);

  const setField = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(createForm("", "xlsx", "weekly", true, filters));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule: ScheduledExport) => {
    setEditing(schedule);
    setForm(
      createForm(
        schedule.name,
        schedule.format,
        schedule.frequency,
        schedule.is_active,
        schedule.filters,
      ),
    );
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("Enter a schedule name.");
      return;
    }
    if (form.from_date && form.to_date && form.from_date > form.to_date) {
      setFormError("The start date must be before the end date.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      format: form.format,
      frequency: form.frequency,
      is_active: form.is_active,
      filters: filterFromForm(form),
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/reports/scheduled-exports/${editing.id}`, payload);
        toast.success("Scheduled export updated");
      } else {
        const created = normalizeScheduledExport(
          await api.post<unknown>("/reports/scheduled-exports", payload),
        );
        if (created.id) setSelectedScheduleId(created.id);
        toast.success("Scheduled export created");
      }
      setDialogOpen(false);
      schedules.reload();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule: ScheduledExport, isActive: boolean) => {
    setBusyId(schedule.id);
    try {
      await api.patch(`/reports/scheduled-exports/${schedule.id}`, {
        is_active: isActive,
      });
      toast.success(isActive ? "Schedule activated" : "Schedule paused");
      schedules.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleRun = async (schedule: ScheduledExport) => {
    setRunBusyId(schedule.id);
    try {
      await api.post(`/reports/scheduled-exports/${schedule.id}/run`);
      toast.success("Export generated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSelectedScheduleId(schedule.id);
      setRunsPage(1);
      runs.reload();
      schedules.reload();
      setRunBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/reports/scheduled-exports/${deleteTarget.id}`);
      if (selectedScheduleId === deleteTarget.id) setSelectedScheduleId("");
      toast.success("Scheduled export deleted");
      setDeleteTarget(null);
      schedules.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDownloadRun = async (run: ScheduledExportRun) => {
    if (run.status !== "ready") return;
    setDownloadingRunId(run.id);
    try {
      await api.download(
        `/reports/scheduled-exports/runs/${run.id}/download`,
        run.filename,
      );
      toast.success("Download started");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloadingRunId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="gap-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Scheduled exports</CardTitle>
            <p className="text-sm text-muted-foreground">
              Generate recurring attendance files from saved report filters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={schedules.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus /> New export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <QueryState
            loading={schedules.loading}
            error={schedules.error}
            data={schedules.data}
            onRetry={schedules.reload}
            skeleton={<TableSkeleton rows={6} columns={6} />}
            emptyTitle="No scheduled exports"
            emptyDescription="Create a schedule to automate recurring attendance exports."
          >
            {(items) =>
              items.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Next run</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell>
                            <p className="font-medium">{schedule.name}</p>
                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                              {describeFilter(schedule.filters) || "All records"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={schedule.format === "pdf" ? "warning" : "success"}>
                              {schedule.format.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {schedule.frequency}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <p>{formatDateTime(schedule.next_run_at)}</p>
                            {schedule.last_run_at ? (
                              <p>Last: {formatDateTime(schedule.last_run_at)}</p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`schedule-active-${schedule.id}`}
                                checked={schedule.is_active}
                                disabled={busyId === schedule.id}
                                onCheckedChange={(checked) =>
                                  void handleToggle(schedule, checked)
                                }
                              />
                              <label
                                htmlFor={`schedule-active-${schedule.id}`}
                                className="text-xs text-muted-foreground"
                              >
                                {schedule.is_active ? "Active" : "Paused"}
                              </label>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId !== null || runBusyId !== null}
                                loading={runBusyId === schedule.id}
                                onClick={() => void handleRun(schedule)}
                              >
                                <Play /> Run now
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId !== null}
                                onClick={() => openEdit(schedule)}
                              >
                                <Pencil /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId !== null}
                                onClick={() => setDeleteTarget(schedule)}
                              >
                                <Trash2 /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title="No scheduled exports"
                  description="Create a schedule to automate recurring attendance exports."
                  action={
                    <Button onClick={openCreate}>
                      <Plus /> New export
                    </Button>
                  }
                />
              )
            }
          </QueryState>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Run history</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review and download files generated by your schedules.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedScheduleId || "none"}
              onValueChange={(value) =>
                setSelectedScheduleId(value === "none" ? "" : value)
              }
            >
              <SelectTrigger id="run-history-schedule" className="w-56">
                <SelectValue placeholder="Select an export" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select an export</SelectItem>
                {scheduleList.map((schedule) => (
                  <SelectItem key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedScheduleId}
              onClick={runs.reload}
            >
              <RefreshCw /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!selectedScheduleId ? (
            <EmptyState
              icon={CalendarClock}
              title="Select a scheduled export"
              description="Choose an export above to view its generated files."
            />
          ) : (
            <QueryState
              loading={runs.loading}
              error={runs.error}
              data={runs.data}
              onRetry={runs.reload}
              skeleton={<TableSkeleton rows={6} columns={4} />}
              emptyTitle="No runs yet"
              emptyDescription="Run the schedule now to generate the first file."
            >
              {(data) =>
                data.items.length ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Download</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.items.map((run) => (
                            <TableRow key={run.id}>
                              <TableCell>
                                <p className="font-medium">{run.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(run.created_at)}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={run.status === "ready" ? "success" : "destructive"}
                                >
                                  {run.status}
                                </Badge>
                                {run.error ? (
                                  <p className="mt-1 max-w-xs text-xs text-destructive">
                                    {run.error}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatBytes(run.size_bytes)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={run.status !== "ready" || downloadingRunId !== null}
                                  loading={downloadingRunId === run.id}
                                  onClick={() => void handleDownloadRun(run)}
                                >
                                  <Download /> Download
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {data.pages > 1 ? (
                      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                        <span>
                          Page {data.page} of {data.pages}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={data.page <= 1}
                            onClick={() => setRunsPage(data.page - 1)}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={data.page >= data.pages}
                            onClick={() => setRunsPage(data.page + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    icon={CalendarClock}
                    title="No runs yet"
                    description="Run this schedule to generate its first file."
                  />
                )
              }
            </QueryState>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit scheduled export" : "New scheduled export"}
            </DialogTitle>
            <DialogDescription>
              Set the schedule details and the filters used for each export.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="schedule-name" required>
                <Input
                  id="schedule-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Weekly attendance"
                />
              </FormField>
              <FormField label="Format" htmlFor="schedule-format">
                <Select
                  value={form.format}
                  onValueChange={(value) =>
                    setField("format", (FORMATS as readonly string[]).includes(value) ? (value as ExportFormat) : "xlsx")
                  }
                >
                  <SelectTrigger id="schedule-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {format.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Frequency" htmlFor="schedule-frequency">
                <Select
                  value={form.frequency}
                  onValueChange={(value) =>
                    setField(
                      "frequency",
                      (FREQUENCIES as readonly string[]).includes(value)
                        ? (value as ExportFrequency)
                        : "weekly",
                    )
                  }
                >
                  <SelectTrigger id="schedule-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {frequency[0].toUpperCase() + frequency.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Paused schedules keep their settings but stop generating files.
                  </p>
                </div>
                <Switch
                  id="schedule-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setField("is_active", checked)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Report filters
              </p>
              {options.loading ? (
                <p className="text-xs text-muted-foreground">Loading filter options…</p>
              ) : null}
              {options.error ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
                  <span className="flex-1">{errorMessage(options.error)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={options.reload}>
                    <RefreshCw /> Retry
                  </Button>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Period" htmlFor="schedule-period">
                  <Select
                    value={form.period}
                    onValueChange={(value) => setField("period", value)}
                  >
                    <SelectTrigger id="schedule-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((period) => (
                        <SelectItem key={period} value={period}>
                          {period[0].toUpperCase() + period.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Department" htmlFor="schedule-department">
                  <Select
                    value={form.department_id || "all"}
                    onValueChange={(value) =>
                      setField("department_id", value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger id="schedule-department">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {(options.data?.departments ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Course" htmlFor="schedule-course">
                  <Select
                    value={form.course_id || "all"}
                    onValueChange={(value) =>
                      setField("course_id", value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger id="schedule-course">
                      <SelectValue placeholder="All courses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All courses</SelectItem>
                      {(options.data?.courses ?? []).map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.code ? `${course.code} · ` : ""}{course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                 </FormField>
                 <FormField label="Class" htmlFor="schedule-class">
                   <Select
                     value={form.class_id || "all"}
                     onValueChange={(value) =>
                       setField("class_id", value === "all" ? "" : value)
                     }
                   >
                     <SelectTrigger id="schedule-class">
                       <SelectValue placeholder="All classes" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All classes</SelectItem>
                       {(options.data?.classes ?? []).map((item) => (
                         <SelectItem key={item.id} value={item.id}>
                           {item.name}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </FormField>
                 {scope === "admin" ? (
                   <FormField label="Professor" htmlFor="schedule-professor">
                    <Select
                      value={form.professor_id || "all"}
                      onValueChange={(value) =>
                        setField("professor_id", value === "all" ? "" : value)
                      }
                    >
                      <SelectTrigger id="schedule-professor">
                        <SelectValue placeholder="All professors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All professors</SelectItem>
                        {(options.data?.professors ?? []).map((professor) => (
                          <SelectItem key={professor.id} value={professor.id}>
                            {professor.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                ) : null}
                <FormField label="Status" htmlFor="schedule-status">
                  <Select
                    value={form.status || "all"}
                    onValueChange={(value) =>
                      setField(
                        "status",
                        value === "all"
                          ? ""
                          : (STATUSES as readonly string[]).includes(value)
                            ? (value as AttendanceStatus)
                            : "",
                      )
                    }
                  >
                    <SelectTrigger id="schedule-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status[0].toUpperCase() + status.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Method" htmlFor="schedule-method">
                  <Select
                    value={form.method || "all"}
                    onValueChange={(value) =>
                      setField(
                        "method",
                        value === "all"
                          ? ""
                          : (METHODS as readonly string[]).includes(value)
                            ? (value as AttendanceMethod)
                            : "",
                      )
                    }
                  >
                    <SelectTrigger id="schedule-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All methods</SelectItem>
                      {METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method[0].toUpperCase() + method.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <DatePicker
                  label="From date"
                  id="schedule-from-date"
                  value={form.from_date}
                  onChange={(value) => setField("from_date", value)}
                />
                <DatePicker
                  label="To date"
                  id="schedule-to-date"
                  value={form.to_date}
                  onChange={(value) => setField("to_date", value)}
                />
              </div>
            </div>

            {formError ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "Save changes" : "Create schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete scheduled export?"
        description={`${deleteTarget?.name ?? "This schedule"} will stop generating future files. Existing runs remain available.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
