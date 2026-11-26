"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  GraduationCap,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceStatusBadge } from "@/components/common/status-badge";
import { AttendanceDonutChart } from "@/components/dashboard/attendance-donut-chart";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { DashboardStatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeSchedule, normalizeStudentDashboard } from "@/lib/normalize";
import type { ClassItem } from "@/lib/types";
import { formatDateTime, formatTime, percent } from "@/lib/utils";

export default function StudentDashboardPage() {
  const loader = useCallback(async () => {
    const [payload, schedule] = await Promise.all([
      api.get<unknown>("/student/dashboard"),
      api.getAll("/student/schedule", normalizeSchedule),
    ]);
    const dayOfWeek = (new Date().getDay() + 6) % 7;
    const todayClasses: ClassItem[] = schedule
      .filter((item) => item.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((item) => ({
        id: item.class_id || item.id,
        name: item.class_name || item.course_name || "Class",
        course_name: item.course_name,
        professor_name: item.professor_name,
        classroom_name: item.classroom_name,
        schedule_days: [String(item.day_of_week)],
        start_time: item.start_time,
        end_time: item.end_time,
      }));
    return { ...normalizeStudentDashboard(payload), today_classes: todayClasses };
  }, []);
  const dashboard = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student overview"
        title="Your attendance, at a glance"
        description="Track your progress, upcoming classes, and recent check-ins in one place."
        actions={
          <>
            <Button asChild>
              <Link href="/student/scan">Check in now</Link>
            </Button>
            <Button variant="outline" onClick={dashboard.reload}>
              <RefreshCw /> Refresh
            </Button>
          </>
        }
      />

      <QueryState
        loading={dashboard.loading}
        error={dashboard.error}
        data={dashboard.data}
        onRetry={dashboard.reload}
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
              <DashboardStatCard
                title="Overall attendance"
                value={percent(data.overall_percentage)}
                icon={TrendingUp}
                tone={data.overall_percentage >= 75 ? "success" : "warning"}
                description="Across enrolled courses"
                href="/student/history"
              />
              <DashboardStatCard
                title="Enrolled courses"
                value={data.enrolled_courses.length}
                icon={BookOpen}
                tone="primary"
                href="/student/classes"
              />
              <DashboardStatCard
                title="Today's classes"
                value={data.today_classes.length}
                icon={CalendarClock}
                tone="sky"
                href="/student/schedule"
              />
              <DashboardStatCard
                title="Warnings"
                value={data.warnings.length}
                icon={AlertTriangle}
                tone={data.warnings.length ? "rose" : "purple"}
                description={data.warnings.length ? "Needs attention" : "All clear"}
              />
            </div>

            {data.warnings.length ? (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                {data.warnings.map((warning, index) => (
                  <p key={index} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AttendanceTrendChart data={data.trend} title="Your attendance trend" />
              </div>
              <AttendanceDonutChart
                data={[
                  { name: "attending", value: data.overall_percentage },
                  { name: "missing", value: Math.max(0, 100 - data.overall_percentage) },
                ]}
                title="Overall percentage"
                centerValue={percent(data.overall_percentage)}
                centerLabel="Attendance"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>Course progress</CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/student/classes">View all</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.enrolled_courses.length === 0 ? (
                    <EmptyState
                      title="No enrolled courses"
                      description="Your coordinator will enroll you in classes."
                      className="border-0 bg-transparent py-6"
                    />
                  ) : (
                    data.enrolled_courses.slice(0, 5).map((course) => (
                      <div key={course.course_id || course.course_name} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{course.course_name}</span>
                          <span className="font-semibold">{percent(course.percentage)}</span>
                        </div>
                        <Progress
                          value={course.percentage}
                          indicatorClassName={
                            course.percentage < 75 ? "bg-destructive" : undefined
                          }
                        />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Today&apos;s schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.today_classes.length === 0 ? (
                    <EmptyState
                      title="No classes today"
                      description="Enjoy the break or review your attendance history."
                      icon={CalendarCheck2}
                      className="border-0 bg-transparent py-6"
                    />
                  ) : (
                    data.today_classes.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-md border border-border p-3"
                      >
                        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <GraduationCap className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.course_name || item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(item.start_time)} – {formatTime(item.end_time)} · {item.classroom_name || "Room TBA"}
                          </p>
                        </div>
                        <Badge variant="outline">{item.name}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Recent attendance</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/student/history">Full history</Link>
                </Button>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {data.recent_attendance.length === 0 ? (
                  <p className="px-5 pb-6 text-sm text-muted-foreground">No attendance records yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent_attendance.slice(0, 6).map((record, index) => (
                        <TableRow key={record.id || index}>
                          <TableCell className="font-medium">{record.class_name || record.course_name || "—"}</TableCell>
                          <TableCell><AttendanceStatusBadge status={record.status} /></TableCell>
                          <TableCell className="capitalize text-muted-foreground">{record.method || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(record.marked_at || record.date)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
