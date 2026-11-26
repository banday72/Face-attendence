"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import {
  normalizeDepartment,
  normalizeFacultyMember,
  normalizeSemester,
  normalizeSubject,
} from "@/lib/normalize";
import type { Department, FacultyMember, Semester, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

const COURSE_TYPES = ["theoretical", "practical", "laboratory"];

interface SubjectForm {
  code: string;
  name: string;
  credits: string;
  department_id: string;
  course_type: string;
  description: string;
  semester_ids: string[];
  eligible_professor_ids: string[];
}

const emptyForm: SubjectForm = {
  code: "",
  name: "",
  credits: "3",
  department_id: "",
  course_type: "theoretical",
  description: "",
  semester_ids: [],
  eligible_professor_ids: [],
};

export default function AdminSubjectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loader = useCallback(
    () =>
      api.getPaginated<Subject>("/admin/subjects", normalizeSubject, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);

  const optionsLoader = useCallback(async () => {
    const [departments, semesters, faculty] = await Promise.all([
      api.getAll("/admin/departments", normalizeDepartment),
      api.getAll("/admin/semesters", normalizeSemester),
      api.getAll("/admin/faculty", normalizeFacultyMember),
    ]);
    return { departments, semesters, faculty };
  }, []);
  const options = useResource(optionsLoader);

  const departmentOptions = (options.data?.departments ?? []).map((item: Department) => ({
    value: item.id,
    label: item.name,
    description: item.code,
  }));

  const setField = <K extends keyof SubjectForm>(key: K, value: SubjectForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggle = (key: "semester_ids" | "eligible_professor_ids", id: string) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((item) => item !== id)
        : [...current[key], id],
    }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (item: Subject) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      credits: String(item.credits),
      department_id: item.department_id,
      course_type: item.course_type,
      description: item.description ?? "",
      semester_ids: item.semester_ids,
      eligible_professor_ids: item.eligible_professor_ids,
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.code.trim()) errors.code = "Enter a subject code.";
    if (!form.name.trim()) errors.name = "Enter a subject name.";
    if (!form.department_id) errors.department_id = "Choose a department.";
    const credits = Number(form.credits);
    if (!Number.isInteger(credits) || credits < 1 || credits > 12) {
      errors.credits = "Credits must be between 1 and 12.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      credits,
      department_id: form.department_id,
      course_type: form.course_type,
      description: form.description || null,
      semester_ids: form.semester_ids,
      eligible_professor_ids: form.eligible_professor_ids,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/admin/subjects/${editing.id}`, payload);
        toast.success("Subject updated");
      } else {
        await api.post("/admin/subjects", payload);
        toast.success("Subject created");
      }
      setDialogOpen(false);
      resource.reload();
      options.reload();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/subjects/${deleting.id}`);
      toast.success("Subject deleted");
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
        eyebrow="Administration"
        title="Subjects"
        description="Define courses, link them to semesters, and choose which faculty may teach them."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New subject
            </Button>
          </>
        }
      />

      <Card className="gap-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code or name"
              className="pl-9"
            />
          </div>
        </div>
        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton rows={8} columns={6} />}
          emptyTitle="No subjects"
          emptyDescription="Create a subject to use it in timetable rules."
        >
          {(payload) => (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Links</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.department_name || "—"}
                        </TableCell>
                        <TableCell>{item.credits}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {item.course_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.semester_ids.length} semesters · {item.eligible_professor_ids.length} faculty
                        </TableCell>
                        <TableCell>
                          <RowActions
                            label={`Actions for ${item.name}`}
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleting(item)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4">
                <Pagination
                  page={payload.page}
                  pages={payload.pages}
                  total={payload.total}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </QueryState>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle>
            <DialogDescription>
              Semesters and faculty links control where this subject can be scheduled.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Code" htmlFor="subject-code" required error={fieldErrors.code}>
                <Input
                  id="subject-code"
                  value={form.code}
                  onChange={(event) => setField("code", event.target.value)}
                  placeholder="CS201"
                />
              </FormField>
              <FormField label="Name" htmlFor="subject-name" required error={fieldErrors.name}>
                <Input
                  id="subject-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Data Structures"
                />
              </FormField>
              <FormField label="Department" required error={fieldErrors.department_id}>
                <SearchableSelect
                  value={form.department_id}
                  onValueChange={(value) => setField("department_id", value)}
                  options={departmentOptions}
                  placeholder="Choose department"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Credits" htmlFor="subject-credits" error={fieldErrors.credits}>
                  <Input
                    id="subject-credits"
                    type="number"
                    min={1}
                    max={12}
                    value={form.credits}
                    onChange={(event) => setField("credits", event.target.value)}
                  />
                </FormField>
                <FormField label="Type">
                  <Select
                    value={form.course_type}
                    onValueChange={(value) => setField("course_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_TYPES.map((item) => (
                        <SelectItem key={item} value={item} className="capitalize">
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </div>

            <FormField label="Description" htmlFor="subject-description">
              <Input
                id="subject-description"
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                placeholder="Optional details"
              />
            </FormField>

            <FormField label="Eligible semesters">
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border border-border p-3">
                {(options.data?.semesters ?? []).map((item: Semester) => (
                  <Badge
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    variant={form.semester_ids.includes(item.id) ? "default" : "outline"}
                    className={cn("cursor-pointer", form.semester_ids.includes(item.id) && "text-primary-foreground")}
                    onClick={() => toggle("semester_ids", item.id)}
                  >
                    {item.code || item.name}
                  </Badge>
                ))}
                {!options.data?.semesters.length ? (
                  <span className="text-xs text-muted-foreground">No semesters available.</span>
                ) : null}
              </div>
            </FormField>

            <FormField label="Eligible faculty">
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border border-border p-3">
                {(options.data?.faculty ?? []).map((item: FacultyMember) => (
                  <Badge
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    variant={form.eligible_professor_ids.includes(item.id) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer",
                      form.eligible_professor_ids.includes(item.id) && "text-primary-foreground",
                    )}
                    onClick={() => toggle("eligible_professor_ids", item.id)}
                  >
                    {item.full_name}
                  </Badge>
                ))}
                {!options.data?.faculty.length ? (
                  <span className="text-xs text-muted-foreground">No faculty available.</span>
                ) : null}
              </div>
            </FormField>

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
                {editing ? "Save changes" : "Create subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete subject?"
        description={`${deleting?.name ?? "This subject"} will be removed from the catalog.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
