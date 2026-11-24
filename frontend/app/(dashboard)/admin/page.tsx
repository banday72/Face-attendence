"use client";

import {
  BookOpen,
  GraduationCap,
  RefreshCw,
  School,
  Users,
  CalendarClock,
  TrendingUp,
  UserCog,
} from "lucide-react";
import { useCallback } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { AttendanceBarChart } from "@/components/dashboard/attendance-bar-chart";
import { AttendanceDonutChart } from "@/components/dashboard/attendance-donut-chart";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { DashboardStatCard } from "@/components/dashboard/stat-card";
import { RecentActivityTable } from "@/components/dashboard/recent-activity-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeAdminDashboard } from "@/lib/normalize";
import { percent } from "@/lib/utils";

export default function AdminDashboardPage() {
  const loader = useCallback(
    () => api.get<unknown>("/admin/dashboard").then(normalizeAdminDashboard),
    [],
  );
  const dashboard = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin overview"
        title="Good to see you"
        description="A live view of attendance, people, and academic activity across your university."
        actions={
          <Button variant="outline" onClick={dashboard.reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <QueryState
        loading={dashboard.loading}
        error={dashboard.error}
        data={dashboard.data}
        onRetry={dashboard.reload}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <Skeleton key={item} className="h-36 rounded-2xl" />
            ))}
          </div>
        }
      >
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardStatCard
                title="Total users"
                value={data.total_users}
                icon={Users}
                description="Registered accounts"
                tone="primary"
                href="/admin/users"
              />
              <DashboardStatCard
                title="Students"
                value={data.total_students}
                icon={GraduationCap}
                description="Enrolled students"
                tone="purple"
                href="/admin/users"
              />
              <DashboardStatCard
                title="Professors"
                value={data.total_professors}
                icon={UserCog}
                description="Teaching staff"
                tone="sky"
                href="/admin/users"
              />
              <DashboardStatCard
                title="Attendance rate"
                value={percent(data.attendance_rate)}
                icon={TrendingUp}
                description="System-wide"
                tone="success"
                href="/admin/reports"
              />
              <DashboardStatCard
                title="Departments"
                value={data.total_departments}
                icon={School}
                tone="warning"
                href="/admin/departments"
              />
              <DashboardStatCard
                title="Courses"
                value={data.total_courses}
                icon={BookOpen}
                tone="primary"
                href="/admin/courses"
              />
              <DashboardStatCard
                title="Classes"
                value={data.total_classes}
                icon={GraduationCap}
                tone="sky"
                href="/admin/classes"
              />
              <DashboardStatCard
                title="Sessions"
                value={data.total_sessions}
                icon={CalendarClock}
                tone="purple"
                href="/admin/reports"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AttendanceTrendChart data={data.trend} />
              </div>
              <AttendanceDonutChart
                data={data.status_distribution}
                title="Status distribution"
                centerValue={data.status_distribution.reduce((sum, item) => sum + item.value, 0)}
              />
            </div>

            <AttendanceBarChart
              data={data.department_attendance}
              title="Attendance by department"
              description="Department-level comparison"
              suffix="%"
            />

            <RecentActivityTable records={data.recent_activity} />
          </>
        )}
      </QueryState>
    </div>
  );
}
