"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Play,
  RefreshCw,
  Square,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QrDisplay } from "@/components/common/qr-display";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge, SessionStatusBadge } from "@/components/common/status-badge";
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
import { Pagination } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
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
import { api, errorMessage } from "@/lib/api";
import { LIVE_REFRESH_MS } from "@/lib/constants";
import { useResource } from "@/lib/hooks";
import {
  normalizePaginated,
  normalizeQrPayload,
  normalizeRosterRecord,
  normalizeSession,
} from "@/lib/normalize";
import type {
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatus,
  Paginated,
  QrPayload,
  Session,
} from "@/lib/types";
import { formatDateTime, formatTime } from "@/lib/utils";

interface SessionMonitor {
  session: Session;
  roster: Paginated<AttendanceRecord>;
}

export default function SessionMonitorPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [closing, setClosing] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>("present");
  const [correctionMethod, setCorrectionMethod] = useState<AttendanceMethod>("manual");
  const [reason, setReason] = useState("");
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const loader = useCallback(async (): Promise<SessionMonitor> => {
    const [sessionPayload, rosterPayload] = await Promise.all([
      api.get<unknown>(`/sessions/${sessionId}`),
      api.get<unknown>(`/sessions/${sessionId}/attendance`, { query: { page, page_size: 50 } }),
    ]);
    return {
      session: normalizeSession(sessionPayload),
      roster: normalizePaginated(rosterPayload, normalizeRosterRecord),
    };
  }, [page, sessionId]);
  const monitor = useResource(loader);
  const { reload } = monitor;

  useEffect(() => {
    setQr(null);
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => reload(), LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  const counts = useMemo(() => {
    const items = monitor.data?.roster.items ?? [];
    return {
      present: Math.max(monitor.data?.session.present_count ?? 0, items.filter((item) => item.status === "present").length),
      late: Math.max(monitor.data?.session.late_count ?? 0, items.filter((item) => item.status === "late").length),
      absent: Math.max(monitor.data?.session.absent_count ?? 0, items.filter((item) => item.status === "absent").length),
    };
  }, [monitor.data]);
  const marked = counts.present + counts.late + counts.absent;
  const attendanceRate = marked > 0 ? ((counts.present + counts.late) / marked) * 100 : 0;

  const runAction = async (action: "start" | "qr/refresh" | "close") => {
    setBusy(action);
    try {
      const response = await api.post<unknown>(`/sessions/${sessionId}/${action}`);
      if (action === "close") {
        setQr(null);
        toast.success("Session closed");
      } else {
        const nextQr = normalizeQrPayload(response);
        if (nextQr) {
          setQr(nextQr);
          toast.success(action === "start" ? "Session started" : "QR token refreshed");
        } else {
          toast.error("Action completed, but no QR token was returned. Try Refresh QR.");
        }
      }
      monitor.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openCorrection = (record: AttendanceRecord) => {
    setCorrecting(record);
    setCorrectionStatus(record.status);
    setCorrectionMethod(record.method ?? "manual");
    setReason("");
    setCorrectionError(null);
  };

  const handleCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!correcting?.id) {
      setCorrectionError("This record has no editable identifier.");
      return;
    }
    if (reason.trim().length < 5) {
      setCorrectionError("Provide a reason of at least 5 characters.");
      return;
    }
    setBusy("correction");
    setCorrectionError(null);
    try {
      await api.patch(`/attendance/${correcting.id}`, {
        status: correctionStatus,
        method: correctionMethod,
        reason: reason.trim(),
      });
      toast.success("Attendance corrected and logged");
      setCorrecting(null);
      monitor.reload();
    } catch (error) {
      setCorrectionError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/professor/sessions">
          <ArrowLeft /> Back to sessions
        </Link>
      </Button>

      <QueryState
        loading={monitor.loading}
        error={monitor.error}
        data={monitor.data}
        onRetry={monitor.reload}
        skeleton={<TableSkeleton columns={5} />}
        emptyTitle="Session not found"
      >
        {(data) => (
          <>
            <PageHeader
              eyebrow="Live monitoring"
              title={data.session.class_name || "Session"}
              description={`${data.session.course_name || "Attendance session"} · updates every 5 seconds`}
              actions={
                <>
                  <Badge variant="outline" className="flex items-center gap-1.5">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
                  </Badge>
                  {data.session.status === "scheduled" ? (
                    <Button loading={busy === "start"} onClick={() => void runAction("start")}>
                      <Play /> Start session
                    </Button>
                  ) : null}
                  {data.session.status === "active" ? (
                    <>
                      <Button
                        variant="outline"
                        loading={busy === "qr/refresh"}
                        onClick={() => void runAction("qr/refresh")}
                      >
                        <RefreshCw /> Refresh QR
                      </Button>
                      <Button variant="destructive" onClick={() => setClosing(true)}>
                        <Square /> Close session
                      </Button>
                    </>
                  ) : null}
                </>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Present</p>
                  <UserCheck className="size-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-3xl font-bold">{counts.present}</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Late</p>
                  <Clock3 className="size-5 text-amber-500" />
                </div>
                <p className="mt-3 text-3xl font-bold">{counts.late}</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Absent</p>
                  <UserX className="size-5 text-rose-500" />
                </div>
                <p className="mt-3 text-3xl font-bold">{counts.absent}</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enrolled</p>
                  <Users className="size-5 text-primary" />
                </div>
                <p className="mt-3 text-3xl font-bold">{data.session.total_students || data.roster.total}</p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Live QR code</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <QrDisplay payload={qr?.qr_payload} />
                  <p className="text-center text-xs text-muted-foreground">
                    {qr?.expires_at
                      ? `Expires ${formatDateTime(qr.expires_at)} · Generation ${qr.generation}.`
                      : data.session.qr_refresh_seconds
                        ? `Rotates every ${data.session.qr_refresh_seconds} seconds.`
                        : "Manual rotation enabled."}
                  </p>
                  {data.session.status === "active" && !qr?.qr_payload ? (
                    <div className="w-full space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        No QR token is available yet. Refresh to display one for students.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={busy === "qr/refresh"}
                        onClick={() => void runAction("qr/refresh")}
                      >
                        <RefreshCw /> Refresh QR
                      </Button>
                    </div>
                  ) : null}
                  <div className="w-full space-y-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Status</span>
                      <SessionStatusBadge status={data.session.status} />
                    </div>
                    <div className="flex justify-between">
                      <span>Start</span>
                      <span>{formatDateTime(data.session.start_time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>End</span>
                      <span>{formatDateTime(data.session.end_time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Late after</span>
                      <span>{data.session.late_minutes} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location</span>
                      <span>{data.session.require_location ? "Required" : "Not required"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Face check-in</span>
                      <span>{data.session.require_face ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>
                  <div className="w-full">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">Attendance rate</span>
                      <span className="font-semibold">{Math.round(attendanceRate)}%</span>
                    </div>
                    <Progress value={attendanceRate} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Live roster</CardTitle>
                  <Button variant="ghost" size="sm" onClick={monitor.reload}>
                    <RefreshCw /> Refresh
                  </Button>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {data.roster.items.length === 0 ? (
                    <p className="px-5 pb-6 text-sm text-muted-foreground">
                      No check-ins yet. The roster will fill as students scan or verify.
                    </p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Checked in</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.roster.items.map((record, index) => (
                            <TableRow key={record.id || index}>
                              <TableCell>
                                <p className="font-medium">{record.student_name || "Student"}</p>
                                <p className="text-xs text-muted-foreground">{record.university_id || "—"}</p>
                              </TableCell>
                              <TableCell><AttendanceStatusBadge status={record.status} /></TableCell>
                              <TableCell className="capitalize text-muted-foreground">{record.method || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {record.marked_at ? formatTime(record.marked_at) : "—"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openCorrection(record)}
                                  disabled={!record.id}
                                >
                                  Correct
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Pagination
                        page={data.roster.page}
                        pages={data.roster.pages}
                        total={data.roster.total}
                        pageSize={data.roster.page_size}
                        onPageChange={setPage}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </QueryState>

      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Close this session?"
        description="Students will no longer be able to check in and missing students will be marked absent."
        confirmLabel="Close session"
        loading={busy === "close"}
        onConfirm={() => {
          void runAction("close").then(() => setClosing(false));
        }}
      />

      <Dialog open={Boolean(correcting)} onOpenChange={(open) => !open && setCorrecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct attendance</DialogTitle>
            <DialogDescription>
              {correcting?.student_name || "Student"} · every correction is written to the audit log.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCorrection} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Status" htmlFor="correction-status" required>
                <Select
                  value={correctionStatus}
                  onValueChange={(value) => setCorrectionStatus(value as AttendanceStatus)}
                >
                  <SelectTrigger id="correction-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["present", "late", "absent", "excused"].map((status) => (
                      <SelectItem key={status} value={status}>
                        {status[0].toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Method" htmlFor="correction-method">
                <Select
                  value={correctionMethod}
                  onValueChange={(value) => setCorrectionMethod(value as AttendanceMethod)}
                >
                  <SelectTrigger id="correction-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["manual", "qr", "face"].map((method) => (
                      <SelectItem key={method} value={method}>
                        {method[0].toUpperCase() + method.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Reason" htmlFor="correction-reason" required error={correctionError ?? undefined}>
              <Textarea
                id="correction-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setCorrectionError(null);
                }}
                placeholder="Explain why this correction is needed…"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCorrecting(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === "correction"}>
                <CheckCircle2 /> Save correction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
