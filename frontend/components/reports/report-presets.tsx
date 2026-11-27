"use client";

import { Check, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizePaginated, normalizeReportPreset } from "@/lib/normalize";
import type { ReportFilter, ReportPreset } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface ReportPresetsProps {
  currentFilters: ReportFilter;
  onApply: (filters: ReportFilter) => void;
}

function describeFilter(filter: ReportFilter): string {
  const parts: string[] = [];
  if (filter.period) parts.push(`Period: ${filter.period}`);
  if (filter.from_date) parts.push(`From: ${filter.from_date.slice(0, 10)}`);
  if (filter.to_date) parts.push(`To: ${filter.to_date.slice(0, 10)}`);
  if (filter.department_id) parts.push(`Department: ${filter.department_id}`);
  if (filter.course_id) parts.push(`Course: ${filter.course_id}`);
  if (filter.class_id) parts.push(`Class: ${filter.class_id}`);
  if (filter.professor_id) parts.push(`Professor: ${filter.professor_id}`);
  if (filter.status) parts.push(`Status: ${filter.status}`);
  if (filter.method) parts.push(`Method: ${filter.method}`);
  if (filter.group_by) parts.push(`Group by: ${filter.group_by}`);
  return parts.join(" · ");
}

export function ReportPresets({ currentFilters, onApply }: ReportPresetsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ReportPreset | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filters = useMemo(() => currentFilters, [currentFilters]);

  const presetsLoader = useCallback(
    () =>
      api
        .get<unknown>("/reports/presets")
        .then((payload) => normalizePaginated(payload, normalizeReportPreset).items),
    [],
  );
  const presets = useResource(presetsLoader);

  const openCreate = () => {
    setName("");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a preset name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/reports/presets", {
        name: name.trim(),
        report_type: "records",
        filters,
        is_default: false,
      });
      toast.success("Preset saved");
      setDialogOpen(false);
      presets.reload();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleApply = (preset: ReportPreset) => {
    toast.success(`${preset.name} applied`);
    onApply(preset.filters);
  };

  const handleSetDefault = async (preset: ReportPreset) => {
    if (preset.is_default) return;
    setBusyId(preset.id);
    try {
      await api.patch(`/reports/presets/${preset.id}`, { is_default: true });
      toast.success(`${preset.name} is now the default`);
      presets.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/reports/presets/${deleting.id}`);
      toast.success("Preset deleted");
      setDeleting(null);
      presets.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="gap-0">
        <CardHeader className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Report presets</CardTitle>
            <p className="text-sm text-muted-foreground">
              Save the active report filters and apply them in one click.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={presets.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus /> New preset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <QueryState
            loading={presets.loading}
            error={presets.error}
            data={presets.data}
            onRetry={presets.reload}
            skeleton={<TableSkeleton rows={6} columns={5} />}
            emptyTitle="No report presets"
            emptyDescription="Save the current filters to reuse them later."
          >
            {(items) =>
              items.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Filters</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((preset) => (
                        <TableRow key={preset.id}>
                          <TableCell>
                            <p className="font-medium">{preset.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(preset.created_at)}
                            </p>
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {preset.report_type}
                          </TableCell>
                          <TableCell className="max-w-xs text-xs text-muted-foreground">
                            {describeFilter(preset.filters) || "All records"}
                          </TableCell>
                          <TableCell>
                            {preset.is_default ? (
                              <Badge variant="success">Default</Badge>
                            ) : (
                              <Badge variant="outline">Optional</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleApply(preset)}>
                                <Check /> Apply
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={preset.is_default || busyId !== null}
                                loading={busyId === preset.id}
                                onClick={() => void handleSetDefault(preset)}
                              >
                                <Star /> Default
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId !== null}
                                onClick={() => setDeleting(preset)}
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
                  title="No report presets"
                  description="Create a preset from the filters on the Reports tab."
                  action={
                    <Button onClick={openCreate}>
                      <Plus /> New preset
                    </Button>
                  }
                />
              )
            }
          </QueryState>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save report preset</DialogTitle>
            <DialogDescription>
              Store the filters currently selected on the Reports tab.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleCreate(event)} className="space-y-4" noValidate>
            <FormField label="Preset name" htmlFor="preset-name" required>
              <Input
                id="preset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Absent students this week"
              />
            </FormField>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current filters
              </p>
              <p className="mt-1 text-sm">{describeFilter(filters) || "No filters selected"}</p>
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
                Save preset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete report preset?"
        description={`${deleting?.name ?? "This preset"} will be removed from your saved reports.`}
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
