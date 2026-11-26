"use client";

import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
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
  normalizeClassroom,
  normalizeDepartment,
  normalizeFacultyMember,
  normalizePaginated,
  normalizeScheduleGroup,
  normalizeSemester,
  normalizeSubject,
  normalizeTimetableConflict,
  normalizeTimetableEntry,
  normalizeTimetableSummary,
} from "@/lib/normalize";
import type {
  RecurrenceType,
  ScheduleGroup,
  TimetableConflict,
  TimetableEntry,
  TimetableView,
} from "@/lib/types";
import { cn, formatDate, formatTime } from "@/lib/utils";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const RECURRENCES: { value: RecurrenceType; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "semester", label: "Whole semester" },
  { value: "daily", label: "Every day" },
  { value: "monthly", label: "Every month" },
  { value: "one_time", label: "One time" },
  { value: "custom", label: "Custom dates" },
];
const CLASS_TYPES = ["Lecture", "Lab", "Practical", "Tutorial"];

interface ScheduleForm {
  kind: "class" | "subject";
  class_id: string;
  course_id: string;
  department_id: string;
  semester_id: string;
  professor_id: string;
  classroom_id: string;
  section: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  class_type: string;
  notes: string;
  recurrence_type: RecurrenceType;
  start_date: string;
  end_date: string;
  custom_dates: string[];
  holiday_dates: string[];
  exclude_holidays: boolean;
  monthly_mode: "date" | "weekday";
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ScheduleForm => ({
  kind: "class",
  class_id: "",
  course_id: "",
  department_id: "",
  semester_id: "",
  professor_id: "",
  classroom_id: "",
  section: "",
  days_of_week: [0],
  start_time: "09:00",
  end_time: "10:30",
  class_type: "Lecture",
  notes: "",
  recurrence_type: "weekly",
  start_date: todayIso(),
  end_date: "",
  custom_dates: [],
  holiday_dates: [],
  exclude_holidays: true,
  monthly_mode: "date",
});

function optionsFrom<T extends { id: string }>(
  items: T[],
  label: (item: T) => string,
  describe?: (item: T) => string | undefined,
): SearchableOption[] {
  return items.map((item) => ({
    value: item.id,
    label: label(item),
    description: describe?.(item),
  }));
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildPayload(form: ScheduleForm): Record<string, unknown> {
  const usesDays = form.recurrence_type === "weekly" || form.recurrence_type === "semester";
  return {
    class_id: form.kind === "class" ? form.class_id || null : null,
    course_id: form.kind === "subject" ? form.course_id || null : null,
    department_id: form.department_id || null,
    semester_id: form.semester_id || null,
    professor_id: form.professor_id || null,
    classroom_id: form.classroom_id || null,
    section: form.section || null,
    days_of_week: usesDays ? form.days_of_week : [],
    start_time: form.start_time,
    end_time: form.end_time,
    class_type: form.class_type,
    notes: form.notes || null,
    recurrence_type: form.recurrence_type,
    start_date: form.recurrence_type === "custom" ? null : form.start_date || null,
    end_date: form.end_date || null,
    custom_dates: form.recurrence_type === "custom" ? form.custom_dates : [],
    holiday_dates: form.holiday_dates,
    exclude_holidays: form.exclude_holidays,
    monthly_mode: form.monthly_mode,
  };
}

function formFromGroup(group: ScheduleGroup): ScheduleForm {
  const first = group.items[0];
  const days = group.items.map((item) => item.day_of_week);
  return {
    kind: first?.course_id && !first?.class_id ? "subject" : "class",
    class_id: first?.class_id ?? "",
    course_id: first?.course_id ?? "",
    department_id: first?.department_id ?? "",
    semester_id: first?.semester_id ?? "",
    professor_id: first?.professor_id ?? "",
    classroom_id: first?.classroom_id ?? "",
    section: "",
    days_of_week: days.length ? days : [0],
    start_time: first?.start_time?.slice(0, 5) ?? "",
    end_time: first?.end_time?.slice(0, 5) ?? "",
    class_type: first?.class_type ?? "Lecture",
    notes: first?.notes ?? "",
    recurrence_type: (first?.recurrence_type as RecurrenceType) ?? "weekly",
    start_date: first?.start_date?.slice(0, 10) ?? "",
    end_date: first?.end_date?.slice(0, 10) ?? "",
    custom_dates: first?.custom_dates ?? [],
    holiday_dates: first?.holiday_dates ?? [],
    exclude_holidays: first?.exclude_holidays ?? false,
    monthly_mode: first?.monthly_mode ?? "date",
  };
}

export default function AdminTimetablePage() {
  const [view, setView] = useState<TimetableView>("week");
  const [anchor, setAnchor] = useState(todayIso());
  const [departmentId, setDepartmentId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [professorId, setProfessorId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [classType, setClassType] = useState("");
  const [search, setSearch] = useState("");
  const [showConflicts, setShowConflicts] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleGroup | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TimetableConflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ScheduleGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dateDraft, setDateDraft] = useState("");

  const timetableLoader = useCallback(
    () =>
      api.getPaginated<TimetableEntry>("/admin/timetable", normalizeTimetableEntry, {
        query: {
          view,
          from_date: anchor,
          to_date: view === "list" ? shiftDate(anchor, 30) : undefined,
          department_id: departmentId || undefined,
          semester_id: semesterId || undefined,
          professor_id: professorId || undefined,
          course_id: courseId || undefined,
          classroom_id: classroomId || undefined,
          class_type: classType || undefined,
          page_size: 500,
        },
      }),
    [anchor, classType, classroomId, courseId, departmentId, professorId, semesterId, view],
  );
  const timetable = useResource(timetableLoader);

  const summaryLoader = useCallback(
    () => api.get<unknown>("/admin/timetable/summary").then(normalizeTimetableSummary),
    [],
  );
  const summary = useResource(summaryLoader);

  const conflictsLoader = useCallback(
    () =>
      api
        .get<unknown[]>("/admin/timetable/conflicts")
        .then((items) => items.map(normalizeTimetableConflict)),
    [],
  );
  const conflictResource = useResource(conflictsLoader);

  const optionsLoader = useCallback(async () => {
    const [departments, semesters, faculty, subjects, classrooms, classes] = await Promise.all([
      api.get<unknown>("/admin/departments", { query: { page_size: 200 } }),
      api.get<unknown>("/admin/semesters", { query: { page_size: 200 } }),
      api.get<unknown>("/admin/faculty", { query: { page_size: 200 } }),
      api.get<unknown>("/admin/subjects", { query: { page_size: 200 } }),
      api.get<unknown>("/admin/classrooms", { query: { page_size: 200 } }),
      api.get<unknown>("/admin/classes", { query: { page_size: 200 } }),
    ]);
    return {
      departments: normalizePaginated(departments, normalizeDepartment).items,
      semesters: normalizePaginated(semesters, normalizeSemester).items,
      faculty: normalizePaginated(faculty, normalizeFacultyMember).items,
      subjects: normalizePaginated(subjects, normalizeSubject).items,
      classrooms: normalizePaginated(classrooms, normalizeClassroom).items,
      classes: normalizePaginated(classes, normalizeClass).items,
    };
  }, []);
  const options = useResource(optionsLoader);

  const departmentOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.departments ?? [],
        (item) => item.name,
        (item) => item.code,
      ),
    [options.data?.departments],
  );
  const semesterOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.semesters ?? [],
        (item) => item.name,
        (item) =>
          [item.code, formatDate(item.start_date), formatDate(item.end_date)]
            .filter(Boolean)
            .join(" · "),
      ),
    [options.data?.semesters],
  );
  const facultyOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.faculty ?? [],
        (item) => item.full_name,
        (item) =>
          [item.employee_id, item.department_name].filter(Boolean).join(" · "),
      ),
    [options.data?.faculty],
  );
  const subjectOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.subjects ?? [],
        (item) => item.name,
        (item) => `${item.code} · ${item.credits} credits`,
      ),
    [options.data?.subjects],
  );
  const classroomOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.classrooms ?? [],
        (item) => item.name,
        (item) =>
          [item.building, item.room, item.capacity ? `${item.capacity} seats` : ""]
            .filter(Boolean)
            .join(" · "),
      ),
    [options.data?.classrooms],
  );
  const classOptions = useMemo(
    () =>
      optionsFrom(
        options.data?.classes ?? [],
        (item) => item.name || item.section || "Class",
        (item) =>
          [item.course_name, item.semester, item.section].filter(Boolean).join(" · "),
      ),
    [options.data?.classes],
  );

  const filteredEntries = useMemo(() => {
    const entries = timetable.data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((item) =>
      [
        item.class_name,
        item.course_name,
        item.course_code,
        item.professor_name,
        item.classroom_name,
        item.notes,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [search, timetable.data]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, TimetableEntry[]>();
    filteredEntries.forEach((item) => {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEntries]);

  const setField = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reloadAll = () => {
    timetable.reload();
    summary.reload();
    conflictResource.reload();
    options.reload();
  };

  const resetFilters = () => {
    setView("week");
    setAnchor(todayIso());
    setDepartmentId("");
    setSemesterId("");
    setProfessorId("");
    setCourseId("");
    setClassroomId("");
    setClassType("");
    setSearch("");
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setFormError(null);
    setPreview([]);
    setDateDraft("");
    setDialogOpen(true);
  };

  const openEdit = async (entry: TimetableEntry) => {
    if (!entry.group_id) {
      toast.error("This legacy schedule cannot be edited as a group");
      return;
    }
    try {
      const payload = await api.get<unknown>(
        `/admin/timetable/schedules/${entry.group_id}`,
      );
      const group = normalizeScheduleGroup(payload);
      setEditing(group);
      setForm(formFromGroup(group));
      setFieldErrors({});
      setFormError(null);
      setPreview([]);
      setDateDraft("");
      setDialogOpen(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (form.kind === "class" && !form.class_id) errors.class_id = "Choose a class.";
    if (form.kind === "subject" && !form.course_id) errors.course_id = "Choose a subject.";
    if (!form.start_time || !form.end_time) errors.start_time = "Add both times.";
    else if (form.end_time <= form.start_time) errors.end_time = "End time must be later.";
    if (
      (form.recurrence_type === "weekly" || form.recurrence_type === "semester") &&
      !form.days_of_week.length
    ) {
      errors.days_of_week = "Select at least one day.";
    }
    if (
      ["one_time", "daily", "monthly", "semester"].includes(form.recurrence_type) &&
      !form.start_date
    ) {
      errors.start_date = "Choose a start date.";
    }
    if (form.recurrence_type === "custom" && !form.custom_dates.length) {
      errors.custom_dates = "Add at least one date.";
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      errors.end_date = "End date must be after the start date.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const checkConflicts = async () => {
    if (!validate()) return;
    setChecking(true);
    setFormError(null);
    try {
      const result = await api.post<unknown>("/admin/schedules/check-conflicts", buildPayload(form));
      const raw = result as { valid?: boolean; conflicts?: unknown[] };
      const conflicts = (raw.conflicts ?? []).map(normalizeTimetableConflict);
      setPreview(conflicts);
      if (raw.valid === false) {
        toast.warning("Conflicts found for this schedule");
      } else {
        toast.success("No blocking conflicts found");
      }
    } catch (error) {
      setFormError(errorMessage(error));
      toast.error(errorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/admin/timetable/schedules/${editing.group_id}`, buildPayload(form));
        toast.success("Timetable rule updated");
      } else {
        await api.post("/admin/timetable/schedules", buildPayload(form));
        toast.success("Timetable rule created");
      }
      setDialogOpen(false);
      reloadAll();
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
      await api.delete(`/admin/timetable/schedules/${deleting.group_id}`);
      toast.success("Timetable rule removed");
      setDeleting(null);
      reloadAll();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const addDate = (field: "custom_dates" | "holiday_dates") => {
    if (!dateDraft) return;
    setForm((current) => ({
      ...current,
      [field]: Array.from(new Set([...current[field], dateDraft])).sort(),
    }));
    setDateDraft("");
  };

  const renderEntryCard = (entry: TimetableEntry) => (
    <Card
      key={entry.id}
      className={cn(
        "cursor-pointer gap-2 p-3 text-left transition-colors hover:border-primary/40",
        entry.group_id ? "" : "opacity-70",
      )}
      onClick={() => void openEdit(entry)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">
          {entry.course_code ? `${entry.course_code} · ` : ""}
          {entry.class_name || entry.course_name || "Class"}
        </p>
        <Badge variant="secondary">{entry.class_type}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
      </p>
      <p className="text-xs text-muted-foreground">
        {entry.professor_name || "Unassigned"} · {entry.classroom_name || "No room"}
      </p>
      {entry.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{entry.notes}</p> : null}
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Timetable management"
        description="Plan recurring classes, detect clashes, and publish one timetable for student schedules and attendance sessions."
        actions={
          <>
            <Button variant="outline" onClick={reloadAll}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              variant={showConflicts ? "secondary" : "outline"}
              onClick={() => setShowConflicts((current) => !current)}
            >
              <AlertTriangle /> Conflicts ({conflictResource.data?.length ?? 0})
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New schedule
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Schedule rules", value: summary.data?.total_schedules, icon: CalendarClock },
          { label: "Classes today", value: summary.data?.classes_today, icon: CalendarClock },
          { label: "Upcoming classes", value: summary.data?.upcoming_classes, icon: CalendarClock },
          { label: "Conflicts", value: summary.data?.conflicts, icon: AlertTriangle },
        ].map((item) => (
          <Card key={item.label} className="gap-1 p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wide">{item.label}</span>
              <item.icon className="size-4" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{item.value ?? "—"}</p>
          </Card>
        ))}
      </div>

      {showConflicts ? (
        <Card className="gap-0 p-4">
          <QueryState
            loading={conflictResource.loading}
            error={conflictResource.error}
            data={conflictResource.data}
            onRetry={conflictResource.reload}
            skeleton={<TableSkeleton rows={3} columns={4} />}
            emptyTitle="No conflicts"
            emptyDescription="All scheduled classes are clear."
          >
            {(items) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.schedule_id}-${index}`}>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>
                        <Badge variant={item.severity === "error" ? "destructive" : "secondary"}>
                          {item.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.date ? formatDate(item.date) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryState>
        </Card>
      ) : null}

      <Card className="gap-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="flex rounded-md border border-border p-1">
            {(["day", "week", "month", "list"] as TimetableView[]).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={view === item ? "secondary" : "ghost"}
                onClick={() => setView(item)}
                className="capitalize"
              >
                {item}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => setAnchor(shiftDate(anchor, view === "month" ? -30 : view === "week" ? -7 : -1))}>
              <ChevronLeft />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAnchor(todayIso())}>
              Today
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => setAnchor(shiftDate(anchor, view === "month" ? 30 : view === "week" ? 7 : 1))}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {view === "month"
              ? formatDate(`${anchor.slice(0, 7)}-01`, "MMMM yyyy")
              : formatDate(anchor)}
          </span>
          <div className="relative ml-auto min-w-56 flex-1 lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search timetable"
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2 xl:grid-cols-6">
          <FormField label="Department">
            <SearchableSelect
              value={departmentId}
              onValueChange={setDepartmentId}
              options={departmentOptions}
              placeholder="All departments"
              allowEmpty
            />
          </FormField>
          <FormField label="Semester">
            <SearchableSelect
              value={semesterId}
              onValueChange={setSemesterId}
              options={semesterOptions}
              placeholder="All semesters"
              allowEmpty
            />
          </FormField>
          <FormField label="Faculty">
            <SearchableSelect
              value={professorId}
              onValueChange={setProfessorId}
              options={facultyOptions}
              placeholder="All faculty"
              allowEmpty
            />
          </FormField>
          <FormField label="Subject">
            <SearchableSelect
              value={courseId}
              onValueChange={setCourseId}
              options={subjectOptions}
              placeholder="All subjects"
              allowEmpty
            />
          </FormField>
          <FormField label="Room">
            <SearchableSelect
              value={classroomId}
              onValueChange={setClassroomId}
              options={classroomOptions}
              placeholder="All rooms"
              allowEmpty
            />
          </FormField>
          <FormField label="Type">
            <Select value={classType || "all"} onValueChange={(value) => setClassType(value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {CLASS_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button variant="ghost" onClick={resetFilters} className="md:col-span-2 xl:col-span-6">
            Reset filters
          </Button>
        </div>

        <QueryState
          loading={timetable.loading}
          error={timetable.error}
          data={timetable.data}
          onRetry={timetable.reload}
          skeleton={<TableSkeleton rows={8} columns={6} />}
          emptyTitle="No timetable entries"
          emptyDescription="Create a recurring schedule or adjust the filters."
        >
          {() => {
            if (!filteredEntries.length) {
              return (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No matching entries in this period.
                </div>
              );
            }
            if (view === "week") {
              return (
                <div className="grid gap-3 overflow-x-auto p-4 md:grid-cols-7">
                  {DAY_FULL.map((day, index) => {
                    const date = shiftDate(anchor, index - new Date(`${anchor}T00:00:00`).getDay() + (new Date(`${anchor}T00:00:00`).getDay() === 0 ? -6 : 1));
                    const items = filteredEntries
                      .filter((entry) => entry.date === date)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    return (
                      <div key={day} className="min-w-44 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{day}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(date, "MMM d")}
                          </span>
                        </div>
                        {items.length ? items.map(renderEntryCard) : (
                          <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                            No classes
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }
            if (view === "month") {
              return (
                <div className="space-y-4 p-4">
                  {groupedByDate.map(([date, items]) => (
                    <div key={date} className="space-y-2">
                      <p className="text-sm font-semibold">{formatDate(date, "EEEE, MMMM d")}</p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {items
                          .sort((a, b) => a.start_time.localeCompare(b.start_time))
                          .map(renderEntryCard)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Class / Course</TableHead>
                      <TableHead>Faculty</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries
                      .slice()
                      .sort((a, b) =>
                        a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time),
                      )
                      .map((entry) => (
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer"
                          onClick={() => void openEdit(entry)}
                        >
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(entry.date, "EEE, MMM d")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">
                              {entry.course_code ? `${entry.course_code} · ` : ""}
                              {entry.class_name || entry.course_name}
                            </p>
                            {entry.notes ? (
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {entry.notes}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{entry.professor_name || "—"}</TableCell>
                          <TableCell className="text-sm">{entry.classroom_name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{entry.class_type}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            );
          }}
        </QueryState>
      </Card>

      <p className="text-xs text-muted-foreground">
        Need to add a subject, room, or holiday?{" "}
        <Link className="text-primary hover:underline" href="/admin/subjects">
          Subjects
        </Link>
        {" · "}
        <Link className="text-primary hover:underline" href="/admin/classrooms">
          Classrooms
        </Link>
        {" · "}
        <Link className="text-primary hover:underline" href="/admin/holidays">
          Holidays
        </Link>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit timetable rule" : "New timetable rule"}</DialogTitle>
            <DialogDescription>
              Choose a class or subject, then define when it repeats. Conflicts are checked before saving.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Schedule for">
                <Select
                  value={form.kind}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      kind: value as ScheduleForm["kind"],
                      class_id: "",
                      course_id: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class">Existing class</SelectItem>
                    <SelectItem value="subject">Subject (auto-create class)</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              {form.kind === "class" ? (
                <FormField label="Class" htmlFor="rule-class" required error={fieldErrors.class_id}>
                  <SearchableSelect
                    id="rule-class"
                    value={form.class_id}
                    onValueChange={(value) => setField("class_id", value)}
                    options={classOptions}
                    placeholder="Search classes"
                    allowEmpty
                  />
                </FormField>
              ) : (
                <FormField label="Subject" htmlFor="rule-subject" required error={fieldErrors.course_id}>
                  <SearchableSelect
                    id="rule-subject"
                    value={form.course_id}
                    onValueChange={(value) => setField("course_id", value)}
                    options={subjectOptions}
                    placeholder="Search subjects"
                    allowEmpty
                  />
                </FormField>
              )}
              <FormField label="Department">
                <SearchableSelect
                  value={form.department_id}
                  onValueChange={(value) => setField("department_id", value)}
                  options={departmentOptions}
                  placeholder="Inherit from class"
                  allowEmpty
                />
              </FormField>
              <FormField label="Semester">
                <SearchableSelect
                  value={form.semester_id}
                  onValueChange={(value) => setField("semester_id", value)}
                  options={semesterOptions}
                  placeholder="No semester"
                  allowEmpty
                />
              </FormField>
              <FormField label="Faculty">
                <SearchableSelect
                  value={form.professor_id}
                  onValueChange={(value) => setField("professor_id", value)}
                  options={facultyOptions}
                  placeholder="Unassigned"
                  allowEmpty
                />
              </FormField>
              <FormField label="Room">
                <SearchableSelect
                  value={form.classroom_id}
                  onValueChange={(value) => setField("classroom_id", value)}
                  options={classroomOptions}
                  placeholder="No room"
                  allowEmpty
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Start time" htmlFor="rule-start" required error={fieldErrors.start_time}>
                <Input
                  id="rule-start"
                  type="time"
                  value={form.start_time}
                  onChange={(event) => setField("start_time", event.target.value)}
                />
              </FormField>
              <FormField label="End time" htmlFor="rule-end" required error={fieldErrors.end_time}>
                <Input
                  id="rule-end"
                  type="time"
                  value={form.end_time}
                  onChange={(event) => setField("end_time", event.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Repetition">
                <Select
                  value={form.recurrence_type}
                  onValueChange={(value) => setField("recurrence_type", value as RecurrenceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Class type">
                <Select
                  value={form.class_type}
                  onValueChange={(value) => setField("class_type", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {(form.recurrence_type === "weekly" || form.recurrence_type === "semester") ? (
              <FormField label="Repeat on" error={fieldErrors.days_of_week} required>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((day, index) => {
                    const active = form.days_of_week.includes(index);
                    return (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={active ? "secondary" : "outline"}
                        onClick={() =>
                          setField(
                            "days_of_week",
                            active
                              ? form.days_of_week.filter((item) => item !== index)
                              : [...form.days_of_week, index].sort(),
                          )
                        }
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </FormField>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {form.recurrence_type !== "custom" ? (
                <DatePicker
                  label="Start date"
                  value={form.start_date}
                  onChange={(value) => setField("start_date", value)}
                  error={fieldErrors.start_date}
                />
              ) : null}
              {form.recurrence_type !== "custom" && form.recurrence_type !== "one_time" ? (
                <DatePicker
                  label="End date (optional)"
                  value={form.end_date}
                  onChange={(value) => setField("end_date", value)}
                  min={form.start_date || undefined}
                  error={fieldErrors.end_date}
                />
              ) : null}
            </div>

            {form.recurrence_type === "monthly" ? (
              <FormField label="Monthly pattern">
                <Select
                  value={form.monthly_mode}
                  onValueChange={(value) => setField("monthly_mode", value as "date" | "weekday")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Same date each month</SelectItem>
                    <SelectItem value="weekday">Same weekday each month</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}

            {form.recurrence_type === "custom" ? (
              <FormField label="Custom dates" error={fieldErrors.custom_dates} required>
                <div className="flex gap-2">
                  <DatePicker value={dateDraft} onChange={setDateDraft} className="flex-1" />
                  <Button type="button" variant="outline" onClick={() => addDate("custom_dates")}>
                    Add
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.custom_dates.map((item) => (
                    <Badge key={item} variant="secondary">
                      {formatDate(item)}
                      <button
                        type="button"
                        className="ml-1"
                        onClick={() =>
                          setField(
                            "custom_dates",
                            form.custom_dates.filter((value) => value !== item),
                          )
                        }
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </FormField>
            ) : null}

            <FormField label="Excluded holiday dates (optional)">
              <div className="flex gap-2">
                <DatePicker value={dateDraft} onChange={setDateDraft} className="flex-1" />
                <Button type="button" variant="outline" onClick={() => addDate("holiday_dates")}>
                  Add
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.holiday_dates.map((item) => (
                  <Badge key={item} variant="secondary">
                    {formatDate(item)}
                    <button
                      type="button"
                      className="ml-1"
                      onClick={() =>
                        setField(
                          "holiday_dates",
                          form.holiday_dates.filter((value) => value !== item),
                        )
                      }
                    >
                      ×
                      </button>
                    </Badge>
                  ))}
                </div>
            </FormField>

            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <Switch
                checked={form.exclude_holidays}
                onCheckedChange={(checked) => setField("exclude_holidays", checked)}
              />
              <div>
                <p className="text-sm font-medium">Skip university holidays</p>
                <p className="text-xs text-muted-foreground">
                  Dates in the holiday list are removed from this rule.
                </p>
              </div>
            </div>

            <FormField label="Notes" htmlFor="rule-notes">
              <Input
                id="rule-notes"
                value={form.notes}
                onChange={(event) => setField("notes", event.target.value)}
                placeholder="Optional instructions for students"
              />
            </FormField>

            {preview.length ? (
              <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Conflicts detected</p>
                {preview.map((item, index) => (
                  <p key={`${item.type}-${index}`} className="text-xs text-destructive">
                    {item.severity === "warning" ? "Warning" : "Error"}: {item.message}
                  </p>
                ))}
              </div>
            ) : null}
            {formError ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={() => void checkConflicts()} loading={checking}>
                Check conflicts
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "Save rule" : "Create rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete timetable rule?"
        description="All occurrences generated from this rule will be removed from the timetable."
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
