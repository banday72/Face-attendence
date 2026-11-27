"use client";

import { Download, FileSpreadsheet, FileText, Filter, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceBarChart } from "@/components/dashboard/attendance-bar-chart";
import { AttendanceDonutChart } from "@/components/dashboard/attendance-donut-chart";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { ReportPresets } from "@/components/reports/report-presets";
import { ScheduledExports } from "@/components/reports/scheduled-exports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, type QueryValue } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import {
  normalizeAttendance,
  normalizeClass,
  normalizeCourse,
  normalizeDepartment,
  normalizePaginated,
  normalizeReportSummary,
} from "@/lib/normalize";
import type {
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatus,
  ReportFilter,
} from "@/lib/types";
import { formatDateTime, toDateInput } from "@/lib/utils";

interface ReportViewerProps {
  scope: "admin" | "professor";
}

interface Filters {
  period: string;
  department_id: string;
  course_id: string;
  professor_id: string;
  class_id: string;
  status: string;
  method: AttendanceMethod | "";
  group_by: string;
  from_date: string;
  to_date: string;
  search: string;
  page: number;
}

const periodOptions = [
  "daily",
  "weekly",
  "monthly",
  "course",
  "student",
  "professor",
  "department",
] as const;
const statusOptions = ["present", "late", "absent", "excused"] as const;
const methodOptions = ["qr", "face", "manual"] as const;

const initialFilters: Filters = {
  period: "weekly",
  department_id: "",
  course_id: "",
  professor_id: "",
  class_id: "",
  status: "",
  method: "",
  group_by: "",
  from_date: "",
  to_date: "",
  search: "",
  page: 1,
};

function optionalStatus(value: string): AttendanceStatus | null {
  return (statusOptions as readonly string[]).includes(value)
    ? (value as AttendanceStatus)
    : null;
}

function optionalMethod(value: string): AttendanceMethod | null {
  return (methodOptions as readonly string[]).includes(value)
    ? (value as AttendanceMethod)
    : null;
}

const statusVariant = {
  present: "success",
  late: "warning",
  absent: "destructive",
  excused: "info",
} as const;

export function ReportViewer({ scope }: ReportViewerProps) {
  const [tab, setTab] = useState("reports");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const setPage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
  };

  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const query = useMemo<Record<string, QueryValue>>(
    () => ({
      period: filters.period,
      department_id: filters.department_id || undefined,
      course_id: filters.course_id || undefined,
      professor_id: filters.professor_id || undefined,
      class_id: filters.class_id || undefined,
      status: filters.status || undefined,
      from_date: filters.from_date || undefined,
      to_date: filters.to_date || undefined,
      search: debouncedSearch || undefined,
    }),
    [
      debouncedSearch,
      filters.class_id,
      filters.course_id,
      filters.department_id,
      filters.professor_id,
      filters.from_date,
      filters.period,
      filters.status,
      filters.to_date,
    ],
  );

  const summaryLoader = useCallback(
    () =>
      api
        .get<unknown>("/reports/summary", { query })
        .then(normalizeReportSummary),
    [query],
  );
  const recordsLoader = useCallback(
    () =>
      api
        .get<unknown>("/reports/records", {
          query: { ...query, page: filters.page, page_size: 20 },
        })
        .then((payload) => normalizePaginated(payload, normalizeAttendance)),
    [filters.page, query],
  );
  const optionsLoader = useCallback(async () => {
    const [departments, courses, classes] = await Promise.all([
      api.getAll("/departments", normalizeDepartment),
      api.getAll("/courses", normalizeCourse),
      api.getAll(scope === "admin" ? "/admin/classes" : "/professor/classes", normalizeClass),
    ]);
    return { departments, courses, classes };
  }, [scope]);

  const summary = useResource(summaryLoader);
  const records = useResource(recordsLoader);
  const options = useResource(optionsLoader);

  const handleExport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await api.download(
        "/reports/export",
        `attendance-report-${toDateInput(new Date())}.${format}`,
        { format, ...query },
      );
      toast.success(`${format.toUpperCase()} export downloaded`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  const reset = () => {
    setFilters(initialFilters);
    summary.reload();
    records.reload();
  };

  const currentFilters = useMemo<ReportFilter>(
    () => ({
      period: filters.period || null,
      department_id: filters.department_id || null,
      course_id: filters.course_id || null,
      class_id: filters.class_id || null,
      professor_id: filters.professor_id || null,
      status: optionalStatus(filters.status),
      method: optionalMethod(filters.method),
      group_by: filters.group_by || null,
      from_date: filters.from_date || null,
      to_date: filters.to_date || null,
    }),
    [
      filters.class_id,
      filters.course_id,
      filters.department_id,
      filters.from_date,
      filters.group_by,
      filters.method,
      filters.period,
      filters.professor_id,
      filters.status,
      filters.to_date,
    ],
  );

  const applyPreset = useCallback((filter: ReportFilter) => {
    setFilters((current) => ({
      ...current,
      period:
        filter.period && (periodOptions as readonly string[]).includes(filter.period)
          ? filter.period
          : initialFilters.period,
      department_id: filter.department_id ?? "",
      course_id: filter.course_id ?? "",
      professor_id: filter.professor_id ?? "",
      class_id: filter.class_id || current.class_id,
      status: filter.status ?? "",
      method: filter.method ?? "",
      group_by: filter.group_by ?? "",
      from_date: filter.from_date ? filter.from_date.slice(0, 10) : "",
      to_date: filter.to_date ? filter.to_date.slice(0, 10) : "",
      search: "",
      page: 1,
    }));
    setTab("reports");
  }, []);

  const recordsData = records.data;
  const summaryData = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Attendance reports"
        description="Filter attendance records, explore trends, and export verified data."
        actions={
          <>
            <Button variant="outline" onClick={reset}>
              <RefreshCw /> Reset
            </Button>
            <Button
              variant="outline"
              loading={exporting === "xlsx"}
              onClick={() => void handleExport("xlsx")}
            >
              <FileSpreadsheet /> Excel
            </Button>
            <Button
              variant="outline"
              loading={exporting === "pdf"}
              onClick={() => void handleExport("pdf")}
            >
              <FileText /> PDF
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled exports</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-0 space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="size-4 text-primary" /> Report filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-period">Period</label>
            <Select value={filters.period} onValueChange={(value) => set("period", value)}>
              <SelectTrigger id="report-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((period) => (
                  <SelectItem key={period} value={period}>
                    {period[0].toUpperCase() + period.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-department">Department</label>
            <Select
              value={filters.department_id || "all"}
              onValueChange={(value) => set("department_id", value === "all" ? "" : value)}
            >
              <SelectTrigger id="report-department">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {(options.data?.departments ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-course">Course</label>
            <Select
              value={filters.course_id || "all"}
              onValueChange={(value) => set("course_id", value === "all" ? "" : value)}
            >
              <SelectTrigger id="report-course">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {(options.data?.courses ?? []).map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.code ? `${course.code} · ` : ""}{course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-class">Class</label>
            <Select
              value={filters.class_id || "all"}
              onValueChange={(value) => set("class_id", value === "all" ? "" : value)}
            >
              <SelectTrigger id="report-class">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(options.data?.classes ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DatePicker
            label="From date"
            value={filters.from_date}
            onChange={(value) => set("from_date", value)}
          />
          <DatePicker
            label="To date"
            value={filters.to_date}
            onChange={(value) => set("to_date", value)}
          />
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-status">Status</label>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) => set("status", value === "all" ? "" : value)}
            >
              <SelectTrigger id="report-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status[0].toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="report-search">Search student</label>
            <Input
              id="report-search"
              placeholder="Name or university ID"
              value={filters.search}
              onChange={(event) => set("search", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <QueryState
        loading={summary.loading}
        error={summary.error}
        data={summaryData}
        onRetry={summary.reload}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-32 rounded-lg" />
            ))}
          </div>
        }
      >
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Total records" value={data.total_records} icon={Download} tone="primary" />
              <StatCard
                title="Average attendance"
                value={`${Math.round(data.average_attendance)}%`}
                icon={FileText}
                tone="success"
              />
              <StatCard title="Present" value={data.present} icon={FileSpreadsheet} tone="sky" />
              <StatCard title="Late / Absent" value={`${data.late} / ${data.absent}`} icon={Filter} tone="warning" />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AttendanceTrendChart
                  data={data.by_period}
                  title="Attendance over time"
                  description="Aggregated for the active filters"
                />
              </div>
              <AttendanceDonutChart
                data={[
                  { name: "present", value: data.present },
                  { name: "late", value: data.late },
                  { name: "absent", value: data.absent },
                ]}
                title="Status split"
                centerLabel="Records"
              />
            </div>
            <AttendanceBarChart
              data={data.by_course.length ? data.by_course : data.by_department}
              title="Attendance by group"
              description="Course or department comparison"
              suffix="%"
            />
          </>
        )}
      </QueryState>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Attendance records</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <QueryState
            loading={records.loading}
            error={records.error}
            data={recordsData}
            onRetry={records.reload}
            skeleton={<Skeleton className="mx-5 h-64" />}
            emptyTitle="No records match these filters"
            emptyDescription="Adjust the filters above or export a different period."
          >
            {(data) => (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((record: AttendanceRecord, index) => (
                      <TableRow key={record.id || index}>
                        <TableCell>
                          <p className="font-medium">{record.student_name || "Student"}</p>
                          <p className="text-xs text-muted-foreground">{record.university_id || "—"}</p>
                        </TableCell>
                        <TableCell>{record.class_name || record.course_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[record.status]}>{record.status}</Badge>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{record.method || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(record.marked_at || record.date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {data.pages > 1 ? (
                  <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    <span>Page {data.page} of {data.pages}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filters.page <= 1}
                        onClick={() => setPage(filters.page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filters.page >= data.pages}
                        onClick={() => setPage(filters.page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </QueryState>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="presets" className="mt-0">
          <ReportPresets currentFilters={currentFilters} onApply={applyPreset} />
        </TabsContent>
        <TabsContent value="scheduled" className="mt-0">
          <ScheduledExports scope={scope} currentFilters={currentFilters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
