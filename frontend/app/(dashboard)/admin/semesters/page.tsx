"use client";

import { CalendarDays, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { RowActions } from "@/components/common/row-actions";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import {
  normalizeDepartment,
  normalizeSemester,
} from "@/lib/normalize";
import type { Department, Semester } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface SemesterForm {
  name: string;
  code: string;
  number: string;
  academic_year: string;
  session: string;
  department_id: string;
  program: string;
  start_date: string;
  end_date: string;
  registration_start: string;
  registration_end: string;
  exam_start: string;
  exam_end: string;
  is_active: boolean;
}

const emptyForm: SemesterForm = {
  name: "",
  code: "",
  number: "",
  academic_year: String(new Date().getFullYear()),
  session: "",
  department_id: "",
  program: "",
  start_date: "",
  end_date: "",
  registration_start: "",
  registration_end: "",
  exam_start: "",
  exam_end: "",
  is_active: false,
};

export default function SemestersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [form, setForm] = useState<SemesterForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Semester | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loader = useCallback(
    () =>
      api.getPaginated<Semester>("/admin/semesters", normalizeSemester, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);

  const departmentsLoader = useCallback(
    () => api.getAll("/departments", normalizeDepartment),
    [],
  );
  const departments = useResource<Department[]>(departmentsLoader);

  const setField = (key: keyof SemesterForm, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (semester: Semester) => {
    setEditing(semester);
    setForm({
      name: semester.name,
      code: semester.code,
      number: semester.number ? String(semester.number) : "",
      academic_year: semester.academic_year,
      session: semester.session ?? "",
      department_id: semester.department_id ?? "",
      program: semester.program ?? "",
      start_date: semester.start_date ?? "",
      end_date: semester.end_date ?? "",
      registration_start: semester.registration_start ?? "",
      registration_end: semester.registration_end ?? "",
      exam_start: semester.exam_start ?? "",
      exam_end: semester.exam_end ?? "",
      is_active: semester.is_active,
    });
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "Semester name is required.";
    if (form.code.trim().length < 2) nextErrors.code = "Use a code of at least 2 characters.";
    if (form.academic_year.trim().length < 4) nextErrors.academic_year = "Academic year is required.";
    const ranges: Array<[string, string, string]> = [
      ["end_date", form.start_date, form.end_date],
      ["registration_end", form.registration_start, form.registration_end],
      ["exam_end", form.exam_start, form.exam_end],
    ];
    ranges.forEach(([field, start, end]) => {
      if (start && end && end < start) nextErrors[field] = "End date must be on or after start date.";
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        number: form.number ? Number(form.number) : undefined,
        academic_year: form.academic_year.trim(),
        session: form.session.trim() || undefined,
        department_id: form.department_id || undefined,
        program: form.program.trim() || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        registration_start: form.registration_start || undefined,
        registration_end: form.registration_end || undefined,
        exam_start: form.exam_start || undefined,
        exam_end: form.exam_end || undefined,
        is_active: form.is_active,
      };
      if (editing) {
        await api.patch(`/admin/semesters/${editing.id}`, payload);
        toast.success("Semester updated");
      } else {
        await api.post("/admin/semesters", payload);
        toast.success("Semester created");
      }
      setDialogOpen(false);
      resource.reload();
    } catch (error) {
      setFormError(errorMessage(error));
      if (error instanceof ApiError) setFieldErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/semesters/${deleting.id}`);
      toast.success("Semester deleted");
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Semesters"
        description="Define academic terms used by classes, courses, and reports."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New semester
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search semesters…"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{resource.data?.total ?? 0} semester(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={8} />}
          emptyTitle="No semesters yet"
          emptyDescription="Create a semester before adding class sections."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No semesters match your search.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semester</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Academic year</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((semester) => (
                      <TableRow key={semester.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <CalendarDays className="size-4" />
                            </span>
                            <div>
                              <p className="font-medium">{semester.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {semester.session || semester.program || semester.department_name || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{semester.code}</TableCell>
                        <TableCell>{semester.academic_year}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {semester.start_date || semester.end_date
                            ? `${formatDate(semester.start_date)} – ${formatDate(semester.end_date)}`
                            : "—"}
                        </TableCell>
                        <TableCell>{semester.class_count ?? 0}</TableCell>
                        <TableCell>{semester.student_count ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={semester.is_current ? "info" : semester.is_active ? "default" : "secondary"}>
                            {semester.is_current ? "Current" : semester.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <RowActions
                            onEdit={() => openEdit(semester)}
                            onDelete={() => setDeleting(semester)}
                            label={`Actions for ${semester.name}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  pageSize={data.page_size}
                  onPageChange={setPage}
                />
              </>
            )
          }
        </QueryState>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit semester" : "New semester"}</DialogTitle>
            <DialogDescription>Add as many semesters as you need. Multiple semesters can be active.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3" noValidate>
            <FormField label="Name" htmlFor="semester-name" required error={fieldErrors.name}>
              <Input id="semester-name" value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Fall 2026" />
            </FormField>
            <FormField label="Code" htmlFor="semester-code" required error={fieldErrors.code}>
              <Input id="semester-code" value={form.code} onChange={(event) => setField("code", event.target.value)} placeholder="F2026" />
            </FormField>
            <FormField label="Number" htmlFor="semester-number" error={fieldErrors.number}>
              <Input id="semester-number" type="number" min={1} max={8} value={form.number} onChange={(event) => setField("number", event.target.value)} />
            </FormField>
            <FormField label="Academic year" htmlFor="semester-year" required error={fieldErrors.academic_year}>
              <Input id="semester-year" value={form.academic_year} onChange={(event) => setField("academic_year", event.target.value)} placeholder="2026/2027" />
            </FormField>
            <FormField label="Session" htmlFor="semester-session" error={fieldErrors.session}>
              <Input id="semester-session" value={form.session} onChange={(event) => setField("session", event.target.value)} placeholder="Morning" />
            </FormField>
            <FormField label="Program" htmlFor="semester-program" error={fieldErrors.program}>
              <Input id="semester-program" value={form.program} onChange={(event) => setField("program", event.target.value)} placeholder="Computer Science" />
            </FormField>
            <FormField label="Department" htmlFor="semester-department" className="sm:col-span-2" error={fieldErrors.department_id}>
              <Select
                value={form.department_id || "none"}
                onValueChange={(value) => setField("department_id", value === "none" ? "" : value)}
              >
                <SelectTrigger id="semester-department">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All departments</SelectItem>
                  {(departments.data ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Start date" htmlFor="semester-start" error={fieldErrors.start_date}>
              <Input id="semester-start" type="date" value={form.start_date} onChange={(event) => setField("start_date", event.target.value)} />
            </FormField>
            <FormField label="End date" htmlFor="semester-end" error={fieldErrors.end_date}>
              <Input id="semester-end" type="date" value={form.end_date} onChange={(event) => setField("end_date", event.target.value)} />
            </FormField>
            <FormField label="Registration start" htmlFor="semester-registration-start" error={fieldErrors.registration_start}>
              <Input id="semester-registration-start" type="date" value={form.registration_start} onChange={(event) => setField("registration_start", event.target.value)} />
            </FormField>
            <FormField label="Registration end" htmlFor="semester-registration-end" error={fieldErrors.registration_end}>
              <Input id="semester-registration-end" type="date" value={form.registration_end} onChange={(event) => setField("registration_end", event.target.value)} />
            </FormField>
            <FormField label="Exam start" htmlFor="semester-exam-start" error={fieldErrors.exam_start}>
              <Input id="semester-exam-start" type="date" value={form.exam_start} onChange={(event) => setField("exam_start", event.target.value)} />
            </FormField>
            <FormField label="Exam end" htmlFor="semester-exam-end" error={fieldErrors.exam_end}>
              <Input id="semester-exam-end" type="date" value={form.exam_end} onChange={(event) => setField("exam_end", event.target.value)} />
            </FormField>
            <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-3">
              <div>
                <p className="text-sm font-medium">Active semester</p>
                <p className="text-xs text-muted-foreground">Active semesters can be used by classes and reports together.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setField("is_active", checked)} aria-label="Active semester" />
            </div>
            {formError ? (
              <p className="sm:col-span-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="sm:col-span-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>{editing ? "Save changes" : "Create semester"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete semester?"
        description={`${deleting?.name ?? "This semester"} will be removed. Semesters referenced by classes cannot be deleted.`}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
