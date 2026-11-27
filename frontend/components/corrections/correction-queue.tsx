"use client";

import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeClass, normalizeCorrectionRequest } from "@/lib/normalize";
import type {
  AttendanceMethod,
  AttendanceStatus,
  ClassItem,
  CorrectionRequest,
  CorrectionReviewPayload,
  CorrectionStatus,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type QueueScope = "professor" | "admin";
type ReviewDecision = CorrectionReviewPayload["decision"];
type FinalMethod = AttendanceMethod | "unchanged";

const STATUS_OPTIONS: CorrectionStatus[] = ["pending", "approved", "rejected"];
const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];
const ATTENDANCE_METHODS: AttendanceMethod[] = ["qr", "face", "manual"];

const statusVariants: Record<CorrectionStatus, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

function parseDecision(value: string): ReviewDecision {
  return value === "rejected" ? "rejected" : "approved";
}

function parseAttendanceStatus(value: string): AttendanceStatus {
  return ATTENDANCE_STATUSES.find((item) => item === value) ?? "present";
}

function parseFinalMethod(value: string): FinalMethod {
  if (value === "unchanged") return "unchanged";
  return ATTENDANCE_METHODS.find((item) => item === value) ?? "unchanged";
}

interface CorrectionQueueProps {
  scope: QueueScope;
}

export function CorrectionQueue({ scope }: CorrectionQueueProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reviewing, setReviewing] = useState<CorrectionRequest | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [finalStatus, setFinalStatus] = useState<AttendanceStatus>("present");
  const [finalMethod, setFinalMethod] = useState<FinalMethod>("unchanged");
  const [reviewNote, setReviewNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requestsLoader = useCallback(
    () =>
      api.getPaginated<CorrectionRequest>(
        "/attendance/correction-requests",
        normalizeCorrectionRequest,
        {
          query: {
            page,
            page_size: 20,
            status: status || undefined,
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            class_id: classId || undefined,
          },
        },
      ),
    [classId, fromDate, page, status, toDate],
  );
  const requests = useResource(requestsLoader);

  const classesLoader = useCallback(
    () =>
      api.getAll<ClassItem>(
        scope === "admin" ? "/admin/classes" : "/professor/classes",
        normalizeClass,
      ),
    [scope],
  );
  const classes = useResource(classesLoader);

  const openReview = (request: CorrectionRequest) => {
    setReviewing(request);
    setDecision("approved");
    setFinalStatus(request.requested_status);
    setFinalMethod("unchanged");
    setReviewNote("");
    setNoteError(null);
    setReviewError(null);
  };

  const closeReview = () => {
    setReviewing(null);
    setNoteError(null);
    setReviewError(null);
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewing?.id) {
      setReviewError("This request cannot be reviewed.");
      return;
    }

    const note = reviewNote.trim();
    if (decision === "rejected" && !note) {
      setNoteError("A review note is required when rejecting a request.");
      return;
    }

    setSaving(true);
    setNoteError(null);
    setReviewError(null);
    try {
      const payload: CorrectionReviewPayload = {
        decision,
        ...(decision === "approved" ? { final_status: finalStatus } : {}),
        ...(decision === "approved" && finalMethod !== "unchanged"
          ? { final_method: finalMethod }
          : {}),
        ...(note ? { review_note: note } : {}),
      };
      await api.post(`/attendance/correction-requests/${reviewing.id}/review`, payload);
      toast.success(
        decision === "approved" ? "Correction approved" : "Correction rejected",
      );
      closeReview();
      requests.reload();
    } catch (error) {
      setReviewError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border pb-4">
          <CardTitle className="text-sm">Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={requests.reload}>
            <RefreshCw /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Status" htmlFor="correction-status-filter">
            <Select
              value={status || "all"}
              onValueChange={(value) => {
                setStatus(value === "all" ? "" : value);
                setPage(1);
              }}
            >
              <SelectTrigger id="correction-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label="Class"
            htmlFor="correction-class-filter"
            hint={classes.error ? "Class list unavailable" : undefined}
          >
            <Select
              value={classId || "all"}
              onValueChange={(value) => {
                setClassId(value === "all" ? "" : value);
                setPage(1);
              }}
            >
              <SelectTrigger id="correction-class-filter">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(classes.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DatePicker
            label="From"
            value={fromDate}
            onChange={(value) => {
              setFromDate(value);
              setPage(1);
            }}
          />
          <DatePicker
            label="To"
            value={toDate}
            onChange={(value) => {
              setToDate(value);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <QueryState
          loading={requests.loading}
          error={requests.error}
          data={requests.data}
          onRetry={requests.reload}
          skeleton={<TableSkeleton columns={8} />}
          emptyTitle="No correction requests"
          emptyDescription="Student correction requests will appear here when submitted."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No requests match these filters.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Review note</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((request, index) => (
                      <TableRow key={request.id || `${request.session_id}-${index}`}>
                        <TableCell>
                          <p className="font-medium">{request.student_name || "Student"}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.university_id || "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <AttendanceStatusBadge status={request.requested_status} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{request.course_code || "Course"}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.class_section || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(request.session_start)}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {request.reason || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[request.status]} className="capitalize">
                            {request.status}
                          </Badge>
                          {request.reviewed_at ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDateTime(request.reviewed_at)}
                            </p>
                          ) : null}
                          {request.reviewer_name ? (
                            <p className="text-xs text-muted-foreground">
                              {request.reviewer_name}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {request.review_note || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReview(request)}
                            disabled={!request.id || request.status !== "pending"}
                          >
                            Review
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

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review correction request</DialogTitle>
            <DialogDescription>
              {reviewing
                ? `${reviewing.student_name || "Student"} · ${reviewing.course_code || "Course"}`
                : "Review this correction request."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleReview(event)} className="space-y-4" noValidate>
            <FormField label="Decision" htmlFor="review-decision" required>
              <Select
                value={decision}
                onValueChange={(value) => {
                  setDecision(parseDecision(value));
                  setNoteError(null);
                }}
              >
                <SelectTrigger id="review-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {decision === "approved" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Final status" htmlFor="review-final-status" required>
                  <Select
                    value={finalStatus}
                    onValueChange={(value) => setFinalStatus(parseAttendanceStatus(value))}
                  >
                    <SelectTrigger id="review-final-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_STATUSES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item[0].toUpperCase() + item.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Final method" htmlFor="review-final-method">
                  <Select
                    value={finalMethod}
                    onValueChange={(value) => setFinalMethod(parseFinalMethod(value))}
                  >
                    <SelectTrigger id="review-final-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unchanged">Keep recorded method</SelectItem>
                      {ATTENDANCE_METHODS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item[0].toUpperCase() + item.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            ) : null}
            <FormField
              label="Review note"
              htmlFor="review-note"
              required={decision === "rejected"}
              error={noteError ?? undefined}
              hint={decision === "approved" ? "Optional. Explain any change to the requested status." : undefined}
            >
              <Textarea
                id="review-note"
                value={reviewNote}
                onChange={(event) => {
                  setReviewNote(event.target.value);
                  setNoteError(null);
                }}
                placeholder={decision === "rejected" ? "Explain why this request is rejected…" : "Add an optional note…"}
              />
            </FormField>
            {reviewError ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {reviewError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeReview}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={decision === "rejected" ? "destructive" : "default"}
                loading={saving}
              >
                {decision === "approved" ? <CheckCircle2 /> : <XCircle />}
                {decision === "approved" ? "Approve request" : "Reject request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
