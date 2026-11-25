"use client";

import {
  Eye,
  MapPin,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  ScanFace,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { SessionStatusBadge } from "@/components/common/status-badge";
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
import { ApiError, api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeClass, normalizeClassroom, normalizePaginated, normalizeSession } from "@/lib/normalize";
import type { Classroom, ClassItem, Session } from "@/lib/types";
import { formatDateTime, toDateTimeLocal } from "@/lib/utils";

const CHALLENGE_OPTIONS = [
  { value: "turn_left", label: "Turn left" },
  { value: "turn_right", label: "Turn right" },
  { value: "blink", label: "Blink" },
] as const;

type SessionChallenge = (typeof CHALLENGE_OPTIONS)[number]["value"];

interface SessionForm {
  class_id: string;
  classroom_id: string;
  start_time: string;
  end_time: string;
  late_minutes: string;
  qr_validity_seconds: string;
  qr_refresh_seconds: string;
  require_location: boolean;
  require_face: boolean;
  challenge: SessionChallenge;
}

const defaultForm: SessionForm = {
  class_id: "",
  classroom_id: "",
  start_time: toDateTimeLocal(new Date()),
  end_time: toDateTimeLocal(new Date(Date.now() + 90 * 60_000)),
  late_minutes: "10",
  qr_validity_seconds: "300",
  qr_refresh_seconds: "60",
  require_location: true,
  require_face: true,
  challenge: "turn_left",
};

function SessionsContent() {
  const searchParams = useSearchParams();
  const preselectedClass = searchParams.get("class_id") ?? "";
  const [classFilter, setClassFilter] = useState(preselectedClass);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SessionForm>(defaultForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<Session | null>(null);

  useEffect(() => {
    if (preselectedClass) setClassFilter(preselectedClass);
  }, [preselectedClass]);

  const loader = useCallback(
    () =>
      api.getPaginated<Session>("/sessions", normalizeSession, {
        query: {
          page,
          page_size: 20,
          class_id: classFilter || undefined,
          status: statusFilter || undefined,
        },
      }),
    [classFilter, page, statusFilter],
  );
  const resource = useResource(loader);

  const optionsLoader = useCallback(async () => {
    const [classes, classrooms] = await Promise.all([
      api.get<unknown>("/professor/classes", { query: { page_size: 200 } }),
      api.get<unknown>("/classrooms"),
    ]);
    return {
      classes: normalizePaginated(classes, normalizeClass).items,
      classrooms: normalizePaginated(classrooms, normalizeClassroom).items,
    };
  }, []);
  const options = useResource(optionsLoader);

  const openCreate = () => {
    setForm({ ...defaultForm, class_id: classFilter || "" });
    setFieldErrors({});
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.class_id) nextErrors.class_id = "Choose a class.";
    if (!form.start_time || !form.end_time) nextErrors.start_time = "Set both start and end times.";
    if (form.start_time && form.end_time && new Date(form.end_time) <= new Date(form.start_time)) {
      nextErrors.end_time = "End time must be after start time.";
    }
    if (Number(form.qr_validity_seconds) < 300) nextErrors.qr_validity_seconds = "Use at least 300 seconds (5 minutes).";
    if (Number(form.qr_refresh_seconds) < 10) nextErrors.qr_refresh_seconds = "Use at least 10 seconds.";
    if (form.require_face && !form.challenge) nextErrors.challenge = "Choose a liveness challenge.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFormError(null);
    try {
      await api.post("/sessions", {
        class_id: form.class_id,
        classroom_id: form.classroom_id || undefined,
        starts_at: new Date(form.start_time).toISOString(),
        ends_at: new Date(form.end_time).toISOString(),
        late_minutes: Number(form.late_minutes),
        qr_validity_seconds: Number(form.qr_validity_seconds),
        qr_refresh_seconds: Number(form.qr_refresh_seconds),
        require_location: form.require_location,
        require_face: form.require_face,
        ...(form.require_face ? { challenge: form.challenge } : {}),
      });
      toast.success("Session created");
      setDialogOpen(false);
      resource.reload();
    } catch (error) {
      setFormError(errorMessage(error));
      if (error instanceof ApiError) setFieldErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (session: Session, action: "start" | "qr/refresh" | "close") => {
    setBusyId(session.id);
    try {
      await api.post(`/sessions/${session.id}/${action}`);
      toast.success(
        action === "start"
          ? "Session opened for check-ins"
          : action === "qr/refresh"
            ? "QR token rotated"
            : "Session closed",
      );
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="Attendance sessions"
        description="Schedule sessions, rotate QR codes, and monitor check-ins in real time."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New session
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={classFilter || "all"}
            onValueChange={(value) => {
              setClassFilter(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(options.data?.classes ?? []).map((item: ClassItem) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || "all"}
            onValueChange={(value) => {
              setStatusFilter(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["scheduled", "active", "closed"].map((status) => (
                <SelectItem key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="ml-auto text-xs text-muted-foreground">{resource.data?.total ?? 0} session(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={7} />}
          emptyTitle="No sessions yet"
          emptyDescription="Create a session to start collecting attendance."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No sessions match these filters.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Counts</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <p className="font-medium">{session.class_name || "Class"}</p>
                          <p className="text-xs text-muted-foreground">{session.classroom_name || "No room"}</p>
                        </TableCell>
                        <TableCell><SessionStatusBadge status={session.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(session.start_time)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {session.require_location ? (
                              <Badge variant="outline" className="text-[10px]"><MapPin className="size-3" /> GPS</Badge>
                            ) : null}
                            {session.require_face ? (
                              <Badge variant="outline" className="text-[10px]"><ScanFace className="size-3" /> Face</Badge>
                            ) : null}
                            <Badge variant="outline" className="text-[10px]">
                              <QrCode className="size-3" /> {session.qr_refresh_seconds || 60}s
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{session.present_count}</span>
                          {" / "}
                          <span className="font-semibold text-amber-600 dark:text-amber-400">{session.late_count}</span>
                          {" / "}
                          <span className="text-muted-foreground">{session.absent_count}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {session.status === "scheduled" ? (
                              <Button
                                size="sm"
                                loading={busyId === session.id}
                                onClick={() => void runAction(session, "start")}
                              >
                                <Play /> Start
                              </Button>
                            ) : null}
                            {session.status === "active" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={busyId === session.id}
                                  onClick={() => void runAction(session, "qr/refresh")}
                                >
                                  <RefreshCw /> Rotate QR
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setClosing(session)}
                                >
                                  <Square /> Close
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/professor/sessions/${session.id}`} aria-label="Monitor session">
                              <Eye />
                            </Link>
                          </Button>
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create attendance session</DialogTitle>
            <DialogDescription>
              Configure the check-in window and verification policy before opening the session.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label="Class" htmlFor="session-class" required error={fieldErrors.class_id} className="sm:col-span-2">
              <Select
                value={form.class_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, class_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="session-class">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a class</SelectItem>
                  {(options.data?.classes ?? []).map((item: ClassItem) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Classroom" htmlFor="session-room" className="sm:col-span-2">
              <Select
                value={form.classroom_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, classroom_id: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger id="session-room">
                  <SelectValue placeholder="No specific room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific room</SelectItem>
                  {(options.data?.classrooms ?? []).map((room: Classroom) => (
                    <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <DatePicker
              label="Starts at"
              type="datetime-local"
              value={form.start_time}
              onChange={(value) => setForm((current) => ({ ...current, start_time: value }))}
              error={fieldErrors.start_time}
            />
            <DatePicker
              label="Ends at"
              type="datetime-local"
              value={form.end_time}
              onChange={(value) => setForm((current) => ({ ...current, end_time: value }))}
              error={fieldErrors.end_time}
            />
            <FormField label="Late threshold (minutes)" htmlFor="session-late" error={fieldErrors.late_minutes}>
              <Input
                id="session-late"
                type="number"
                min={0}
                value={form.late_minutes}
                onChange={(event) => setForm((current) => ({ ...current, late_minutes: event.target.value }))}
              />
            </FormField>
            <FormField label="QR validity (seconds)" htmlFor="session-qr-validity" error={fieldErrors.qr_validity_seconds}>
              <Input
                id="session-qr-validity"
                type="number"
                min={300}
                value={form.qr_validity_seconds}
                onChange={(event) =>
                  setForm((current) => ({ ...current, qr_validity_seconds: event.target.value }))
                }
              />
            </FormField>
            <FormField label="QR refresh (seconds)" htmlFor="session-qr" error={fieldErrors.qr_refresh_seconds}>
              <Input
                id="session-qr"
                type="number"
                min={10}
                value={form.qr_refresh_seconds}
                onChange={(event) =>
                  setForm((current) => ({ ...current, qr_refresh_seconds: event.target.value }))
                }
              />
            </FormField>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Require location</p>
                <p className="text-xs text-muted-foreground">Check GPS distance from the classroom.</p>
              </div>
              <Switch
                checked={form.require_location}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, require_location: checked }))
                }
                aria-label="Require location"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Enable face check-in</p>
                <p className="text-xs text-muted-foreground">Allow liveness-verified check-ins.</p>
              </div>
              <Switch
                checked={form.require_face}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, require_face: checked }))
                }
                aria-label="Enable face check-in"
              />
            </div>
            {form.require_face ? (
              <FormField
                label="Liveness challenge"
                htmlFor="session-challenge"
                required
                error={fieldErrors.challenge}
                className="sm:col-span-2"
              >
                <Select
                  value={form.challenge}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      challenge: value as SessionChallenge,
                    }))
                  }
                >
                  <SelectTrigger id="session-challenge">
                    <SelectValue placeholder="Select a challenge" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHALLENGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}
            {formError ? (
              <p className="sm:col-span-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-2 border-t border-border bg-card px-6 py-4 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Create session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(closing)}
        onOpenChange={(open) => !open && setClosing(null)}
        title="Close session?"
        description="Check-ins will be blocked and students without a record will be marked absent."
        confirmLabel="Close session"
        loading={busyId === closing?.id}
        onConfirm={() => {
          if (closing) void runAction(closing, "close").then(() => setClosing(null));
        }}
      />
    </div>
  );
}

export default function ProfessorSessionsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading sessions…</div>}>
      <SessionsContent />
    </Suspense>
  );
}
