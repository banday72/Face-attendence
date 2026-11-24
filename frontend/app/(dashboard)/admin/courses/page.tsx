"use client";

import { BookOpen, Plus, RefreshCw, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import {
  normalizeCourse,
  normalizeCourseProfessor,
  normalizeDepartment,
  normalizePaginated,
  normalizeProfessorOption,
} from "@/lib/normalize";
import type {
  Course,
  CourseProfessor,
  Department,
  ProfessorOption,
} from "@/lib/types";

interface CourseForm {
  name: string;
  code: string;
  credits: string;
  department_id: string;
  description: string;
}

const emptyForm: CourseForm = { name: "", code: "", credits: "3", department_id: "", description: "" };

export default function CoursesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [assigning, setAssigning] = useState<Course | null>(null);
  const [assigned, setAssigned] = useState<CourseProfessor[]>([]);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const loader = useCallback(
    () =>
      api.getPaginated<Course>("/admin/courses", normalizeCourse, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);
  const departmentsLoader = useCallback(
    () => api.get<unknown>("/departments").then((payload) => normalizePaginated(payload, normalizeDepartment).items),
    [],
  );
  const departments = useResource<Department[]>(departmentsLoader);

  const reloadAssignments = useCallback(async (courseId: string) => {
    const payload = await api.get<unknown>(`/admin/courses/${courseId}/professors`);
    setAssigned((payload as unknown[]).map(normalizeCourseProfessor));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setForm({
      name: course.name,
      code: course.code ?? "",
      credits: course.credits ? String(course.credits) : "3",
      department_id: course.department_id ?? "",
      description: course.description ?? "",
    });
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openAssign = async (course: Course) => {
    setAssigning(course);
    setSelectedProfessor("");
    setAssignError(null);
    setAssignLoading(true);
    try {
      const [options] = await Promise.all([
        api.get<unknown>("/admin/professors", { query: { page_size: 100 } }),
        reloadAssignments(course.id),
      ]);
      setProfessors(normalizePaginated(options, normalizeProfessorOption).items);
    } catch (error) {
      setAssignError(errorMessage(error));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Course name is required.";
    if (form.code.trim().length < 2) nextErrors.code = "Use a course code of at least 2 characters.";
    if (!form.department_id) nextErrors.department_id = "Choose a department.";
    const credits = Number(form.credits || 3);
    if (!Number.isFinite(credits) || credits < 1 || credits > 12) nextErrors.credits = "Credits must be between 1 and 12.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        credits,
        department_id: form.department_id,
        description: form.description.trim() || undefined,
      };
      if (editing) {
        await api.patch(`/admin/courses/${editing.id}`, payload);
        toast.success("Course updated");
      } else {
        await api.post("/admin/courses", payload);
        toast.success("Course created");
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
      await api.delete(`/admin/courses/${deleting.id}`);
      toast.success("Course deleted");
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assigning || !selectedProfessor) {
      setAssignError("Choose a professor first.");
      return;
    }
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.post(`/admin/courses/${assigning.id}/professors/${selectedProfessor}`);
      toast.success("Professor assigned to course");
      setSelectedProfessor("");
      await reloadAssignments(assigning.id);
    } catch (error) {
      setAssignError(errorMessage(error));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUnassign = async (professorId: string) => {
    if (!assigning) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.delete(`/admin/courses/${assigning.id}/professors/${professorId}`);
      toast.success("Professor unassigned");
      await reloadAssignments(assigning.id);
    } catch (error) {
      setAssignError(errorMessage(error));
    } finally {
      setAssignLoading(false);
    }
  };

  const availableProfessors = professors.filter(
    (professor) => !assigned.some((item) => item.professor_id === professor.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Courses"
        description="Define courses, assign professors, and open the related class sections."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button variant="outline" onClick={() => router.push("/admin/departments")}>
              Departments
            </Button>
            <Button variant="outline" onClick={() => router.push("/admin/classes")}>
              Class sections
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New course
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
              placeholder="Search courses…"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{resource.data?.total ?? 0} course(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={6} />}
          emptyTitle="No courses yet"
          emptyDescription="Add a course to start creating class sections."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No courses match your search.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <BookOpen className="size-4" />
                            </span>
                            <span className="font-medium">{course.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{course.code || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{course.department_name || "—"}</TableCell>
                        <TableCell>{course.credits || "—"}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {course.description || "—"}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            onEdit={() => openEdit(course)}
                            onDelete={() => setDeleting(course)}
                            label={`Actions for ${course.name}`}
                            extra={
                              <>
                                <DropdownMenuItem onSelect={() => void openAssign(course)}>
                                  <Users /> Assign teachers
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            }
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit course" : "New course"}</DialogTitle>
            <DialogDescription>Course details are used across classes, assignments, and reports.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label="Course name" htmlFor="course-name" required error={fieldErrors.name}>
              <Input
                id="course-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </FormField>
            <FormField label="Code" htmlFor="course-code" required error={fieldErrors.code}>
              <Input
                id="course-code"
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
            </FormField>
            <FormField label="Department" htmlFor="course-department" required error={fieldErrors.department_id}>
              <Select
                value={form.department_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, department_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="course-department">
                  <SelectValue placeholder="Choose department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Choose department</SelectItem>
                  {(departments.data ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Credits" htmlFor="course-credits" error={fieldErrors.credits}>
              <Input
                id="course-credits"
                type="number"
                min={1}
                max={12}
                value={form.credits}
                onChange={(event) => setForm((current) => ({ ...current, credits: event.target.value }))}
              />
            </FormField>
            <FormField
              label="Description"
              htmlFor="course-description"
              className="sm:col-span-2"
              error={fieldErrors.description}
            >
              <Textarea
                id="course-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </FormField>
            {formError ? (
              <p className="sm:col-span-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "Save changes" : "Create course"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(assigning)}
        onOpenChange={(open) => {
          if (!open) {
            setAssigning(null);
            setAssignError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teachers for {assigning?.name ?? "course"}</DialogTitle>
            <DialogDescription>
              Course assignments are separate from class sections. Assign a class professor to control attendance access.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedProfessor} onValueChange={setSelectedProfessor}>
                <SelectTrigger className="sm:flex-1">
                  <SelectValue placeholder="Choose professor" />
                </SelectTrigger>
                <SelectContent>
                  {availableProfessors.map((professor) => (
                    <SelectItem key={professor.id} value={professor.id}>
                      {professor.full_name} · {professor.employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={() => void handleAssign()} loading={assignLoading}>
                Assign teacher
              </Button>
            </div>
            <div className="space-y-2">
              {assigned.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No teachers assigned to this course yet.
                </p>
              ) : (
                assigned.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">{item.full_name}</p>
                      <p className="text-xs text-muted-foreground">{item.email} · {item.employee_id}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={assignLoading}
                      onClick={() => void handleUnassign(item.professor_id)}
                    >
                      Unassign
                    </Button>
                  </div>
                ))
              )}
            </div>
            {assignError ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {assignError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Badge variant="secondary">{assigned.length} assigned</Badge>
            <Button type="button" variant="outline" onClick={() => setAssigning(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete course?"
        description={`${deleting?.name ?? "This course"} will be removed from the catalog.`}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
