"use client";

import { CalendarClock, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
  normalizeClass,
  normalizeClassroom,
  normalizePaginated,
  normalizeSchedule,
} from "@/lib/normalize";
import type { Classroom, ClassItem, ScheduleItem } from "@/lib/types";
import { formatTime } from "@/lib/utils";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface ScheduleForm {
  class_id: string;
  classroom_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

const emptyForm: ScheduleForm = {
  class_id: "",
  classroom_id: "",
  day_of_week: "0",
  start_time: "",
  end_time: "",
};

export default function AdminTimetablePage() {
  const [classFilter, setClassFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ScheduleItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loader = useCallback(
    () =>
      api
        .get<unknown>("/admin/schedules", { query: { page_size: 100 } })
        .then((payload) => normalizePaginated(payload, normalizeSchedule)),
    [],
  );
  const resource = useResource(loader);

  const optionsLoader = useCallback(async () => {
    const [classes, classrooms] = await Promise.all([
      api.get<unknown>("/admin/classes", { query: { page_size: 100 } }),
      api.get<unknown>("/classrooms", { query: { page_size: 100 } }),
    ]);
    return {
      classes: normalizePaginated(classes, normalizeClass).items,
      classrooms: normalizePaginated(classrooms, normalizeClassroom).items,
    };
  }, []);
  const options = useResource(optionsLoader);

  const classOptions = useMemo(() => options.data?.classes ?? [], [options.data?.classes]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (item: ScheduleItem) => {
    setEditing(item);
    setForm({
      class_id: item.class_id,
      classroom_id: item.classroom_id ?? "",
      day_of_week: Number.isFinite(item.day_of_week) ? String(item.day_of_week) : "0",
      start_time: item.start_time?.slice(0, 5) ?? "",
      end_time: item.end_time?.slice(0, 5) ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.class_id) nextErrors.class_id = "Choose a class.";
    if (!form.start_time || !form.end_time) {
      nextErrors.start_time = "Add both start and end times.";
    } else if (form.end_time <= form.start_time) {
      nextErrors.end_time = "End time must be later than start time.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    const payload = {
      class_id: form.class_id,
      classroom_id: form.classroom_id || null,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
    };
    try {
      if (editing) {
        await api.patch(`/admin/schedules/${editing.id}`, payload);
        toast.success("Timetable entry updated");
      } else {
        await api.post("/admin/schedules", payload);
        toast.success("Timetable entry created");
      }
      setDialogOpen(false);
      resource.reload();
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
      await api.delete(`/admin/schedules/${deleting.id}`);
      toast.success("Timetable entry removed");
      setDeleting(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const resetFilters = () => {
    setClassFilter("all");
    setDayFilter("all");
    setSearch("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Timetable"
        description="Create the weekly class schedule used by student dashboards, sessions, and attendance checks."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> Add schedule
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search class, course, or room"
              className="pl-9"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="lg:w-64">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(options.data?.classes ?? []).map((item: ClassItem) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name || item.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="lg:w-40">
              <SelectValue placeholder="All days" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All days</SelectItem>
              {DAY_NAMES.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={resetFilters}>
            Reset
          </Button>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton rows={8} columns={6} />}
          emptyTitle="No timetable entries"
          emptyDescription="Add a weekly schedule slot to get started."
        >
          {(payload) => {
            const needle = debouncedSearch.trim().toLowerCase();
            const items = payload.items
              .filter((item) => classFilter === "all" || item.class_id === classFilter)
              .filter((item) => dayFilter === "all" || item.day_of_week === Number(dayFilter))
              .filter((item) => {
                if (!needle) return true;
                return [item.class_name, item.course_name, item.classroom_name]
                  .filter(Boolean)
                  .some((value) => value?.toLowerCase().includes(needle));
              })
              .sort(
                (a, b) =>
                  a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
              );
            if (!items.length) {
              return (
                <div className="p-6">
                  <EmptyState
                    title="No matching entries"
                    description="Try a different class, day, or search term."
                    icon={CalendarClock}
                  />
                </div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {DAY_NAMES[item.day_of_week] ?? item.day_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(item.start_time)} – {formatTime(item.end_time)}
                        </TableCell>
                        <TableCell>{item.class_name || item.class_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.course_name || "—"}
                        </TableCell>
                        <TableCell>
                          {item.classroom_name ? (
                            <Badge variant="secondary">{item.classroom_name}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            label={`Actions for ${item.class_name || "schedule"}`}
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleting(item)}
                          />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "Add schedule"}</DialogTitle>
            <DialogDescription>
              Choose the class, day, time range, and room for this weekly slot.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label="Class" htmlFor="schedule-class" required error={fieldErrors.class_id}>
              <Select
                value={form.class_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, class_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="schedule-class">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select class</SelectItem>
                  {classOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name || item.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Room" htmlFor="schedule-room">
              <Select
                value={form.classroom_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, classroom_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="schedule-room">
                  <SelectValue placeholder="No room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No room</SelectItem>
                  {(options.data?.classrooms ?? []).map((item: Classroom) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Day" htmlFor="schedule-day" required>
              <Select
                value={form.day_of_week}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, day_of_week: value }))
                }
              >
                <SelectTrigger id="schedule-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((day, index) => (
                    <SelectItem key={day} value={String(index)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <FormField label="Start time" htmlFor="schedule-start" required error={fieldErrors.start_time}>
                <Input
                  id="schedule-start"
                  type="time"
                  value={form.start_time}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, start_time: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="End time" htmlFor="schedule-end" required error={fieldErrors.end_time}>
                <Input
                  id="schedule-end"
                  type="time"
                  value={form.end_time}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, end_time: event.target.value }))
                  }
                />
              </FormField>
            </div>
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
                {editing ? "Save changes" : "Create schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete schedule?"
        description={`${DAY_NAMES[deleting?.day_of_week ?? 0] ?? "This"} slot will be removed from the timetable.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
