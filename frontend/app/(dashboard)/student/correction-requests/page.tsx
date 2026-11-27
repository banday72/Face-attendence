"use client";

import { ClipboardList, Eye, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { CorrectionRequestDialog } from "@/components/corrections/correction-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeCorrectionRequest } from "@/lib/normalize";
import type { CorrectionRequest, CorrectionStatus } from "@/lib/types";
import { formatDateTime, truncate } from "@/lib/utils";

const correctionVariants: Record<CorrectionStatus, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

function CorrectionStatusBadge({ status }: { status: CorrectionStatus }) {
  return (
    <Badge variant={correctionVariants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export default function StudentCorrectionRequestsPage() {
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CorrectionRequest | null>(null);
  const [withdrawing, setWithdrawing] = useState<CorrectionRequest | null>(null);
  const [requestAgain, setRequestAgain] = useState<CorrectionRequest | null>(null);
  const [withdrawingBusy, setWithdrawingBusy] = useState(false);

  const loader = useCallback(
    () =>
      api.getPaginated<CorrectionRequest>("/attendance/correction-requests/me", normalizeCorrectionRequest, {
        query: {
          page,
          page_size: 20,
          status: status || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
      }),
    [fromDate, page, status, toDate],
  );
  const resource = useResource(loader);

  const handleWithdraw = async () => {
    if (!withdrawing) return;
    setWithdrawingBusy(true);
    try {
      await api.post(`/attendance/correction-requests/${withdrawing.id}/withdraw`);
      toast.success("Correction request withdrawn");
      setWithdrawing(null);
      resource.reload();
    } catch (error) {
      toast.error(errorMessage(error));
      setWithdrawing(null);
    } finally {
      setWithdrawingBusy(false);
    }
  };

  const clearFilters = () => {
    setStatus("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Correction requests"
        description="Track the attendance corrections you submitted and their review decisions."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/student/history">
                <ClipboardList /> Request from history
              </Link>
            </Button>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["pending", "approved", "rejected"].map((item) => (
                <SelectItem key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <div className="flex items-end">
            <Button variant="ghost" className="w-full" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={6} />}
          emptyTitle="No correction requests"
          emptyDescription="If a class record is wrong, open attendance history and request a correction."
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
                      <TableHead>Class</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <p className="font-medium">{request.course_code || "Course"}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.class_section || "—"} · {formatDateTime(request.session_start)}
                          </p>
                        </TableCell>
                        <TableCell><AttendanceStatusBadge status={request.requested_status} /></TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(request.created_at)}
                        </TableCell>
                        <TableCell>
                          <CorrectionStatusBadge status={request.status} />
                          {request.reviewed_at ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {formatDateTime(request.reviewed_at)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                          {truncate(request.reason || "—", 60)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="View request details"
                              onClick={() => setDetail(request)}
                            >
                              <Eye />
                            </Button>
                            {request.status === "pending" ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Withdraw request"
                                onClick={() => setWithdrawing(request)}
                              >
                                <Trash2 />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Request correction again"
                                onClick={() => setRequestAgain(request)}
                              >
                                <RotateCcw />
                              </Button>
                            )}
                          </div>
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

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Correction request</DialogTitle>
            <DialogDescription>
              Submitted {formatDateTime(detail?.created_at)} · ID {detail?.id || "—"}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <CorrectionStatusBadge status={detail.status} />
                <AttendanceStatusBadge status={detail.requested_status} />
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Class</p>
                  <p className="mt-1 font-medium">{detail.course_code || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section</p>
                  <p className="mt-1">{detail.class_section || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session</p>
                  <p className="mt-1">{formatDateTime(detail.session_start)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record ID</p>
                  <p className="mt-1 font-mono text-xs">{detail.record_id || "—"}</p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.reason || "—"}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review</p>
                <p className="mt-1 text-sm">
                  {detail.reviewer_name || "Not reviewed yet"}
                  {detail.reviewed_at ? ` · ${formatDateTime(detail.reviewed_at)}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{detail.review_note || "No review note."}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(withdrawing)}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        title="Withdraw this request?"
        description="Your professor will no longer be able to review it. You can submit a new request later."
        confirmLabel="Withdraw request"
        loading={withdrawingBusy}
        onConfirm={() => void handleWithdraw()}
      />

      <CorrectionRequestDialog
        open={Boolean(requestAgain)}
        onOpenChange={(open) => !open && setRequestAgain(null)}
        sessionId={requestAgain?.session_id ?? ""}
        recordId={requestAgain?.record_id}
        defaultRequestedStatus={requestAgain?.requested_status}
        onSuccess={resource.reload}
      />
    </div>
  );
}
