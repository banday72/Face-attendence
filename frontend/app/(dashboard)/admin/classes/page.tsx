"use client";

import { GraduationCap, Plus, RefreshCw, Search, UserMinus, Users } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
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
import { ApiError, api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import {
  normalizeAttendance,
  normalizeClass,
  normalizeClassroom,
  normalizeCourse,
  normalizePaginated,
  normalizeUser,
} from "@/lib/normalize";
import type {
  AttendanceRecord,
  Classroom,
  ClassItem,
  Course,
  User,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ClassForm {
  name: string;
  section: string;
  course_id: string;
  professor_id: string;
  classroom_id: string;
  semester: string;
  academic_year: string;
  capacity: string;
  days: string[];
  start_time: string;
  end_time: string;
}

const emptyForm: ClassForm = {
  name: "",
  section: "",
  course_id: "",
  professor_id: "",
  classroom_id: "",
  semester: "",
  academic_year: "",
  capacity: "",
  days: [],
  start_time: "",
  end_time: "",
};

export default function ClassesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<ClassForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ClassItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [enrollmentClass, setEnrollmentClass] = useState<ClassItem | null>(null);
  const [studentId, setStudentId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [unenrolling, setUnenrolling] = useState<AttendanceRecord | null>(null);

  const loader = useCallback(
    () =>
      api.getPaginated<ClassItem>("/admin/classes", normalizeClass, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);

  const optionsLoader = useCallback(async () => {
    const [courses, professors, classrooms] = await Promise.all([
      api.get<unknown>("/courses"),
      api.get<unknown>("/admin/users", { query: { role: "professor", page_size: 100 } }),
      api.get<unknown>("/classrooms"),
    ]);
    return {
      courses: normalizePaginated(courses, normalizeCourse).items,
      professors: normalizePaginated(professors, normalizeUser).items,
      classrooms: normalizePaginated(classrooms, normalizeClassroom).items,
    };
  }, []);
  const options = useResource(optionsLoader);

  const studentOptionsLoader = useCallback(
    () =>
      api
        .get<unknown>("/admin/users", { query: { role: "student", page_size: 100 } })
        .then((payload) => normalizePaginated(payload, normalizeUser).items),
    [],
  );
  const studentOptions = useResource<User[]>(studentOptionsLoader, Boolean(enrollmentClass));

  const rosterLoader = useCallback(
    () =>
      api
        .get<unknown>(`/attendance/classes/${enrollmentClass?.id ?? ""}`, { query: { page_size: 200 } })
        .then((payload) => normalizePaginated(payload, normalizeAttendance)),
    [enrollmentClass?.id],
  );
  const roster = useResource(rosterLoader, Boolean(enrollmentClass));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (item: ClassItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      section: item.section ?? "",
      course_id: item.course_id ?? "",
      professor_id: item.professor_id ?? "",
      classroom_id: item.classroom_id ?? "",
      semester: item.semester ?? "",
      academic_year: item.academic_year ?? "",
      capacity: item.capacity ? String(item.capacity) : "",
      days: item.schedule_days,
      start_time: item.start_time?.slice(0, 5) ?? "",
      end_time: item.end_time?.slice(0, 5) ?? "",
    });
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Class name is required.";
    if (!form.course_id) nextErrors.course_id = "Choose a course.";
    if (!form.start_time || !form.end_time) nextErrors.schedule = "Add start and end times.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        section: form.section.trim() || undefined,
        course_id: form.course_id,
        professor_id: form.professor_id || null,
        classroom_id: form.classroom_id || null,
        semester: form.semester.trim() || undefined,
        academic_year: form.academic_year.trim() || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        schedule_days: form.days,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
      };
      if (editing) {
        await api.patch(`/admin/classes/${editing.id}`, payload);
        toast.success("Class updated");
      } else {
        await api.post("/admin/classes", payload);
        toast.success("Class created");
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
      await api.delete(`/admin/classes/${deleting.id}`);
      toast.success("Class deleted");
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!enrollmentClass || !studentId) {
      toast.error("Select a student first.");
      return;
    }
    setEnrolling(true);
    try {
      await api.post(`/admin/classes/${enrollmentClass.id}/enrollments`, { student_id: studentId });
      toast.success("Student enrolled");
      setStudentId("");
      roster.reload();
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = async () => {
    if (!enrollmentClass || !unenrolling?.student_id) return;
    setDeleteLoading(true);
    try {
      await api.delete(
        `/admin/classes/${enrollmentClass.id}/enrollments/${unenrolling.student_id}`,
      );
      toast.success("Student unenrolled");
      setUnenrolling(null);
      roster.reload();
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
        title="Classes"
        description="Build class sections, assign professors, and manage enrollments."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New class
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
              placeholder="Search classes…"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{resource.data?.total ?? 0} class(es)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={7} />}
          emptyTitle="No classes yet"
          emptyDescription="Create a class after courses and professors are available."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No classes match your search.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Professor</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                              <GraduationCap className="size-4" />
                            </span>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.classroom_name || "No room"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{item.course_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.professor_name || "Unassigned"}</TableCell>
                        <TableCell>
                          <p className="text-xs">
                            {item.schedule_days.length ? item.schedule_days.join(", ") : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(item.start_time)} – {formatTime(item.end_time)}
                          </p>
                        </TableCell>
                        <TableCell>
                          {Number.isFinite(item.enrolled_count) ? (
                            <Badge variant="info">{item.enrolled_count} students</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[item.semester, item.academic_year].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleting(item)}
                            label={`Actions for ${item.name}`}
                            extra={
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setEnrollmentClass(item)}>
                                  <Users /> Manage students
                                </DropdownMenuItem>
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
        <DialogContent className="max-h-[92vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit class" : "New class"}</DialogTitle>
            <DialogDescription>Assign a course, professor, room, and weekly schedule.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label="Class name" htmlFor="class-name" required error={fieldErrors.name}>
              <Input
                id="class-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="CS-A"
              />
            </FormField>
            <FormField label="Section" htmlFor="class-section" error={fieldErrors.section}>
              <Input
                id="class-section"
                value={form.section}
                onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))}
              />
            </FormField>
            <FormField label="Course" htmlFor="class-course" required error={fieldErrors.course_id}>
              <Select
                value={form.course_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, course_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="class-course">
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select course</SelectItem>
                  {(options.data?.courses ?? []).map((course: Course) => (
                    <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Professor" htmlFor="class-professor">
              <Select
                value={form.professor_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, professor_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="class-professor">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(options.data?.professors ?? []).map((professor: User) => (
                    <SelectItem key={professor.id} value={professor.id}>{professor.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Classroom" htmlFor="class-classroom">
              <Select
                value={form.classroom_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, classroom_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="class-classroom">
                  <SelectValue placeholder="No room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No room</SelectItem>
                  {(options.data?.classrooms ?? []).map((classroom: Classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Capacity" htmlFor="class-capacity">
              <Input
                id="class-capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              />
            </FormField>
            <FormField label="Semester" htmlFor="class-semester">
              <Input
                id="class-semester"
                value={form.semester}
                onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))}
                placeholder="Fall"
              />
            </FormField>
            <FormField label="Academic year" htmlFor="class-year">
              <Input
                id="class-year"
                value={form.academic_year}
                onChange={(event) => setForm((current) => ({ ...current, academic_year: event.target.value }))}
                placeholder="2025-2026"
              />
            </FormField>
            <FormField label="Start time" htmlFor="class-start" error={fieldErrors.schedule}>
              <Input
                id="class-start"
                type="time"
                value={form.start_time}
                onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
              />
            </FormField>
            <FormField label="End time" htmlFor="class-end">
              <Input
                id="class-end"
                type="time"
                value={form.end_time}
                onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
              />
            </FormField>
            <div className="space-y-2 sm:col-span-2">
              <Label>Meeting days</Label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => {
                  const checked = form.days.includes(day);
                  return (
                    <label
                      key={day}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setForm((current) => ({
                            ...current,
                            days: checked
                              ? current.days.filter((value) => value !== day)
                              : [...current.days, day],
                          }))
                        }
                      />
                      {day}
                    </label>
                  );
                })}
              </div>
            </div>
            {formError ? (
              <p className="sm:col-span-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "Save changes" : "Create class"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(enrollmentClass)} onOpenChange={(open) => !open && setEnrollmentClass(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Students · {enrollmentClass?.name}</DialogTitle>
            <DialogDescription>Enroll or remove students from this class.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={studentId || "none"} onValueChange={(value) => setStudentId(value === "none" ? "" : value)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a student</SelectItem>
                {(studentOptions.data ?? []).map((student: User) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.full_name} · {student.university_id || student.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleEnroll} loading={enrolling} disabled={!studentId}>
              <Plus /> Enroll
            </Button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
            {roster.loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading roster…</div>
            ) : roster.error ? (
              <div className="p-6 text-center text-sm text-destructive">{errorMessage(roster.error)}</div>
            ) : (roster.data?.items ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No students enrolled yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>University ID</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(roster.data?.items ?? []).map((record, index) => (
                    <TableRow key={record.student_id || index}>
                      <TableCell className="font-medium">{record.student_name || "Student"}</TableCell>
                      <TableCell className="text-muted-foreground">{record.university_id || "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${record.student_name}`}
                          onClick={() => setUnenrolling(record)}
                        >
                          <UserMinus className="text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete class?"
        description={`${deleting?.name ?? "This class"} and its schedule will be removed.`}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={Boolean(unenrolling)}
        onOpenChange={(open) => !open && setUnenrolling(null)}
        title="Remove student?"
        description={`${unenrolling?.student_name ?? "This student"} will no longer be enrolled in ${enrollmentClass?.name ?? "this class"}.`}
        loading={deleteLoading}
        confirmLabel="Remove"
        onConfirm={handleUnenroll}
      />
    </div>
  );
}
