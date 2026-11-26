"use client";

import { DoorOpen, Plus, RefreshCw, Search } from "lucide-react";
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
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeClassroom } from "@/lib/normalize";
import type { Classroom } from "@/lib/types";

const ROOM_TYPES = ["Classroom", "Laboratory", "Lecture hall", "Seminar room", "Studio"];

interface ClassroomForm {
  name: string;
  building: string;
  room: string;
  room_type: string;
  capacity: string;
  latitude: string;
  longitude: string;
  radius_override_meters: string;
  is_active: boolean;
}

const emptyForm: ClassroomForm = {
  name: "",
  building: "",
  room: "",
  room_type: "Classroom",
  capacity: "",
  latitude: "0",
  longitude: "0",
  radius_override_meters: "",
  is_active: true,
};

export default function AdminClassroomsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Classroom | null>(null);
  const [form, setForm] = useState<ClassroomForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Classroom | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loader = useCallback(
    () =>
      api.getPaginated<Classroom>("/admin/classrooms", normalizeClassroom, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);

  const setField = <K extends keyof ClassroomForm>(key: K, value: ClassroomForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (item: Classroom) => {
    setEditing(item);
    setForm({
      name: item.name,
      building: item.building ?? "",
      room: item.room ?? "",
      room_type: item.room_type ?? "Classroom",
      capacity: item.capacity ? String(item.capacity) : "",
      latitude: String(item.latitude ?? 0),
      longitude: String(item.longitude ?? 0),
      radius_override_meters: item.radius_override_meters
        ? String(item.radius_override_meters)
        : "",
      is_active: item.is_active ?? true,
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Enter a room name.";
    const capacity = form.capacity ? Number(form.capacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
      errors.capacity = "Capacity must be between 1 and 1000.";
    }
    const latitude = Number(form.latitude || 0);
    const longitude = Number(form.longitude || 0);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) errors.latitude = "Invalid latitude.";
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      errors.longitude = "Invalid longitude.";
    }
    const radius = form.radius_override_meters ? Number(form.radius_override_meters) : null;
    if (radius !== null && (!Number.isFinite(radius) || radius < 1 || radius > 10000)) {
      errors.radius_override_meters = "Radius must be between 1 and 10000 meters.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const payload = {
      name: form.name.trim(),
      building: form.building || null,
      room: form.room || null,
      room_type: form.room_type,
      capacity,
      latitude,
      longitude,
      radius_override_meters: radius,
      is_active: form.is_active,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/admin/classrooms/${editing.id}`, payload);
        toast.success("Classroom updated");
      } else {
        await api.post("/admin/classrooms", payload);
        toast.success("Classroom created");
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
      await api.delete(`/admin/classrooms/${deleting.id}`);
      toast.success("Classroom deleted");
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
        title="Classrooms"
        description="Manage rooms, seating capacity, and location rules used by timetable conflicts and check-ins."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New classroom
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
              placeholder="Search rooms or buildings"
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
          emptyTitle="No classrooms"
          emptyDescription="Add a room before creating timetable entries."
        >
          {(payload) => (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Room</TableHead>
                      <TableHead>Building</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <DoorOpen className="size-4 text-muted-foreground" />
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.building || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.room_type}</Badge>
                        </TableCell>
                        <TableCell>{item.capacity ?? "—"}</TableCell>
                        <TableCell>{item.scheduled_classes ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? "default" : "secondary"}>
                            {item.is_active ? "Active" : "Inactive"}
                          </Badge>
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
                  pageSize={payload.page_size}
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
            <DialogTitle>{editing ? "Edit classroom" : "New classroom"}</DialogTitle>
            <DialogDescription>
              Capacity and room type help the scheduler flag unsuitable bookings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="room-name" required error={fieldErrors.name}>
                <Input
                  id="room-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Room A-101"
                />
              </FormField>
              <FormField label="Building" htmlFor="room-building">
                <Input
                  id="room-building"
                  value={form.building}
                  onChange={(event) => setField("building", event.target.value)}
                  placeholder="Main block"
                />
              </FormField>
              <FormField label="Room number" htmlFor="room-number">
                <Input
                  id="room-number"
                  value={form.room}
                  onChange={(event) => setField("room", event.target.value)}
                  placeholder="A-101"
                />
              </FormField>
              <FormField label="Type">
                <Select value={form.room_type} onValueChange={(value) => setField("room_type", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Capacity" htmlFor="room-capacity" error={fieldErrors.capacity}>
                <Input
                  id="room-capacity"
                  type="number"
                  min={1}
                  max={1000}
                  value={form.capacity}
                  onChange={(event) => setField("capacity", event.target.value)}
                  placeholder="60"
                />
              </FormField>
              <FormField
                label="Location radius override (meters)"
                htmlFor="room-radius"
                error={fieldErrors.radius_override_meters}
              >
                <Input
                  id="room-radius"
                  type="number"
                  min={1}
                  max={10000}
                  value={form.radius_override_meters}
                  onChange={(event) => setField("radius_override_meters", event.target.value)}
                  placeholder="Use default"
                />
              </FormField>
              <FormField label="Latitude" htmlFor="room-lat" error={fieldErrors.latitude}>
                <Input
                  id="room-lat"
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(event) => setField("latitude", event.target.value)}
                />
              </FormField>
              <FormField label="Longitude" htmlFor="room-lng" error={fieldErrors.longitude}>
                <Input
                  id="room-lng"
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(event) => setField("longitude", event.target.value)}
                />
              </FormField>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setField("is_active", checked)}
              />
              <div>
                <p className="text-sm font-medium">Available for scheduling</p>
                <p className="text-xs text-muted-foreground">
                  Inactive rooms are hidden from timetable pickers.
                </p>
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
                {editing ? "Save changes" : "Create classroom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete classroom?"
        description={`${deleting?.name ?? "This room"} will be removed. Existing timetable entries keep the room name but lose the link.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
