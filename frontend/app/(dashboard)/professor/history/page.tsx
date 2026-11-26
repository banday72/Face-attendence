"use client";

import { History, RefreshCw, Search } from "lucide-react";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeAttendance, normalizeClass } from "@/lib/normalize";
import { formatDateTime } from "@/lib/utils";

export default function ProfessorHistoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const loader = useCallback(
    () =>
      api.getPaginated("/professor/attendance/history", normalizeAttendance, {
        query: {
          page,
          page_size: 20,
          search: debouncedSearch || undefined,
          status: status || undefined,
          class_id: classId || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
      }),
    [classId, debouncedSearch, fromDate, page, status, toDate],
  );
  const resource = useResource(loader);
  const classesLoader = useCallback(() => api.getAll("/professor/classes", normalizeClass), []);
  const classes = useResource(classesLoader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Attendance history"
        description="Search every recorded check-in, correction, and absence for your classes."
        actions={
          <Button variant="outline" onClick={resource.reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

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
              placeholder="Search students…"
              className="pl-9"
            />
          </div>
          <Select
            value={classId || "all"}
            onValueChange={(value) => {
              setClassId(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
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

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={7} />}
          emptyTitle="No attendance history"
          emptyDescription="Attendance records will appear here after sessions are held."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No records match your filters.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Refresh</span>
                        <button type="button" onClick={resource.reload} aria-label="Refresh history">
                          <RefreshCw className="size-4 text-muted-foreground" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((record, index) => (
                      <TableRow key={record.id || index}>
                        <TableCell>
                          <p className="font-medium">{record.student_name || "Student"}</p>
                          <p className="text-xs text-muted-foreground">{record.university_id || "—"}</p>
                        </TableCell>
                        <TableCell>{record.class_name || record.course_name || "—"}</TableCell>
                        <TableCell><AttendanceStatusBadge status={record.status} /></TableCell>
                        <TableCell className="capitalize text-muted-foreground">{record.method || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(record.marked_at || record.date)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {record.reason || "—"}
                        </TableCell>
                        <TableCell><History className="size-3.5 text-muted-foreground" /></TableCell>
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
    </div>
  );
}
