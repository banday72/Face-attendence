"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
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
import { normalizeHoliday } from "@/lib/normalize";
import type { Holiday } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const HOLIDAY_TYPES = ["Holiday", "Exam period", "Break", "Event", "Closure"];

interface HolidayForm {
  name: string;
  holiday_date: string;
  holiday_type: string;
  description: string;
}

const emptyForm: HolidayForm = {
  name: "",
  holiday_date: "",
  holiday_type: "Holiday",
  description: "",
};

export default function AdminHolidaysPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState<HolidayForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loader = useCallback(
    () => api.get<unknown[]>("/admin/holidays", { query: { page_size: 500 } }),
    [],
  );
  const resource = useResource(loader);

  const items = useMemo(() => (resource.data ?? []).map(normalizeHoliday), [resource.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.holiday_type, item.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [items, search]);

  const setField = <K extends keyof HolidayForm>(key: K, value: HolidayForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (item: Holiday) => {
    setEditing(item);
    setForm({
      name: item.name,
      holiday_date: item.holiday_date.slice(0, 10),
      holiday_type: item.holiday_type,
      description: item.description ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Enter a name.";
    if (!form.holiday_date) errors.holiday_date = "Choose a date.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const payload = {
      name: form.name.trim(),
      holiday_date: form.holiday_date,
      holiday_type: form.holiday_type,
      description: form.description || null,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/admin/holidays/${editing.id}`, payload);
        toast.success("Holiday updated");
      } else {
        await api.post("/admin/holidays", payload);
        toast.success("Holiday added");
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
      await api.delete(`/admin/holidays/${deleting.id}`);
      toast.success("Holiday removed");
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
        title="Academic calendar"
        description="Closure dates are excluded from timetable rules that opt into holiday skipping."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> Add holiday
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search holidays"
              className="pl-9"
            />
          </div>
        </div>
        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton rows={8} columns={4} />}
          emptyTitle="No holidays"
          emptyDescription="Add closure dates to keep the timetable accurate."
        >
          {() => (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered
                    .slice()
                    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatDate(item.holiday_date, "EEE, MMM d, yyyy")}
                        </TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.holiday_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.description || "—"}
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
          )}
        </QueryState>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
            <DialogDescription>
              Add a one-off date that should be skipped by scheduled classes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <FormField label="Name" htmlFor="holiday-name" required error={fieldErrors.name}>
              <Input
                id="holiday-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Founder's Day"
              />
            </FormField>
            <DatePicker
              label="Date"
              value={form.holiday_date}
              onChange={(value) => setField("holiday_date", value)}
              error={fieldErrors.holiday_date}
            />
            <FormField label="Type">
              <select
                value={form.holiday_type}
                onChange={(event) => setField("holiday_type", event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                {HOLIDAY_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Description" htmlFor="holiday-description">
              <Input
                id="holiday-description"
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                placeholder="Optional details"
              />
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
                {editing ? "Save changes" : "Add holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove holiday?"
        description={`${deleting?.name ?? "This date"} will no longer be excluded from timetable rules.`}
        confirmLabel="Remove"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
