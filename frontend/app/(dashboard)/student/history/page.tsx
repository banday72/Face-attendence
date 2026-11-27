"use client";

import { ClipboardList, Download, History, RefreshCw, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge } from "@/components/common/status-badge";
import { CorrectionRequestDialog } from "@/components/corrections/correction-request-dialog";
import { AttendanceDonutChart } from "@/components/dashboard/attendance-donut-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
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
import { api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeAttendanceSummary } from "@/lib/normalize";
import { formatDateTime, percent } from "@/lib/utils";

export default function StudentHistoryPage() {
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [correction, setCorrection] = useState<{ sessionId: string; recordId: string } | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const exportCertificate = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      await api.download("/attendance/me/certificate", `attendance-certificate.${format}`, {
        format,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        course_id: courseId || undefined,
        include_details: false,
      });
      toast.success(`${format === "pdf" ? "PDF certificate" : "XLSX details"} downloaded`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  const loader = useCallback(
    () =>
      api
        .get<unknown>("/attendance/me", {
          query: {
            page,
            page_size: 20,
            course_id: courseId || undefined,
            status: status || undefined,
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            search: debouncedSearch || undefined,
          },
        })
        .then(normalizeAttendanceSummary),
    [courseId, debouncedSearch, fromDate, page, status, toDate],
  );
  const resource = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Attendance history"
        description="Review every class session and see your performance course by course."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button
              variant="outline"
              loading={exporting === "pdf"}
              onClick={() => void exportCertificate("pdf")}
            >
              <Download /> PDF certificate
            </Button>
            <Button
              variant="outline"
              loading={exporting === "xlsx"}
              onClick={() => void exportCertificate("xlsx")}
            >
              <Download /> XLSX details
            </Button>
          </>
        }
      />

      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={<div className="h-96 animate-pulse rounded-lg bg-muted/60" />}
        emptyTitle="No attendance data"
      >
        {(data) => (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <Card>
                <CardHeader>
                  <CardTitle>Course-wise performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.percentages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No course percentages available yet.</p>
                  ) : (
                    data.percentages.map((course) => (
                      <div key={course.course_id || course.course_name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{course.course_name}</span>
                          <span className="font-semibold">{percent(course.percentage)}</span>
                        </div>
                        <Progress value={course.percentage} />
                        <p className="text-[11px] text-muted-foreground">
                          {course.present} present · {course.late} late · {course.absent} absent
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              <AttendanceDonutChart
                data={[
                  { name: "attending", value: data.overall_percentage },
                  { name: "missing", value: Math.max(0, 100 - data.overall_percentage) },
                ]}
                title="Overall"
                centerValue={percent(data.overall_percentage)}
              />
            </div>

            <Card>
              <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search records…"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={courseId || "all"}
                  onValueChange={(value) => {
                    setCourseId(value === "all" ? "" : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All courses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All courses</SelectItem>
                    {data.percentages.map((course) => (
                      <SelectItem key={course.course_id || course.course_name} value={course.course_id}>
                        {course.course_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status || "all"}
                  onValueChange={(value) => {
                    setStatus(value === "all" ? "" : value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {["present", "late", "absent", "excused"].map((item) => (
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
              </div>

              {data.records.items.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No records match these filters.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Date</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead className="w-12">
                          <button type="button" onClick={resource.reload} aria-label="Refresh history">
                            <RefreshCw className="size-4 text-muted-foreground" />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.records.items.map((record, index) => (
                        <TableRow key={record.id || index}>
                          <TableCell>
                            <p className="font-medium">{record.class_name || record.course_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(record.date)}</p>
                          </TableCell>
                          <TableCell><AttendanceStatusBadge status={record.status} /></TableCell>
                          <TableCell className="capitalize text-muted-foreground">{record.method || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(record.marked_at || record.date)}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {record.location_status?.replaceAll("_", " ") || "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!record.session_id || !record.id}
                              onClick={() =>
                                setCorrection({
                                  sessionId: record.session_id ?? "",
                                  recordId: record.id,
                                })
                              }
                            >
                              <ClipboardList /> Request correction
                            </Button>
                          </TableCell>
                          <TableCell><History className="size-3.5 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={data.records.page}
                    pages={data.records.pages}
                    total={data.records.total}
                    pageSize={data.records.page_size}
                    onPageChange={setPage}
                  />
                </>
              )}
            </Card>
          </>
        )}
      </QueryState>

      <CorrectionRequestDialog
        open={Boolean(correction)}
        onOpenChange={(open) => !open && setCorrection(null)}
        sessionId={correction?.sessionId ?? ""}
        recordId={correction?.recordId}
        onSuccess={resource.reload}
      />
    </div>
  );
}
