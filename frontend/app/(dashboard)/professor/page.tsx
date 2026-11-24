"use client";

import {
  BookOpen,
  CalendarClock,
  GraduationCap,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { SessionStatusBadge } from "@/components/common/status-badge";
import { AttendanceBarChart } from "@/components/dashboard/attendance-bar-chart";
import { AttendanceDonutChart } from "@/components/dashboard/attendance-donut-chart";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { DashboardStatCard } from "@/components/dashboard/stat-card";
import { RecentActivityTable } from "@/components/dashboard/recent-activity-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { normalizeProfessorDashboard } from "@/lib/normalize";
import { formatDateTime, percent } from "@/lib/utils";

export default function ProfessorDashboardPage() {
  const loader = useCallback(
    () => api.get<unknown>("/professor/dashboard").then(normalizeProfessorDashboard),
    [],
  );
  const dashboard = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="Class overview"
        description="Attendance signals from the classes and sessions you teach."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/professor/sessions">Manage sessions</Link>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        }
      >
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <DashboardStatCard title="Courses" value={data.assigned_courses} icon={BookOpen} tone="primary" href="/professor/classes" />
              <DashboardStatCard title="Classes" value={data.assigned_classes} icon={GraduationCap} tone="purple" href="/professor/classes" />
              <DashboardStatCard title="Students" value={data.total_students} icon={Users} tone="sky" href="/professor/students" />
              <DashboardStatCard title="Sessions" value={data.total_sessions} icon={CalendarClock} tone="warning" href="/professor/sessions" />
              <DashboardStatCard title="Attendance" value={percent(data.attendance_rate)} icon={TrendingUp} tone="success" href="/professor/reports" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AttendanceTrendChart data={data.trend} description="Attendance across your recent sessions" />
              </div>
              <AttendanceDonutChart
                data={data.status_distribution}
                title="Student statuses"
                centerLabel="Records"
              />
            </div>

            <AttendanceBarChart
              data={data.class_attendance}
              title="Class comparison"
              description="Attendance percentage by assigned class"
              suffix="%"
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <RecentActivityTable records={data.recent_activity} />
              <Card>
                <CardHeader>
                  <CardTitle>Recent sessions</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {data.recent_sessions.length === 0 ? (
                    <p className="px-5 pb-6 text-sm text-muted-foreground">No sessions have been created yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Class</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recent_sessions.slice(0, 6).map((session) => (
                          <TableRow key={session.id}>
                            <TableCell className="font-medium">{session.class_name || "Class"}</TableCell>
                            <TableCell><SessionStatusBadge status={session.status} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateTime(session.start_time || session.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
