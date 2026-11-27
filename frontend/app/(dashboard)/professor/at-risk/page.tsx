"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  GraduationCap,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
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
import { normalizeClassRisk, normalizePaginated } from "@/lib/normalize";
import type { ClassRisk } from "@/lib/types";
import { cn, percent } from "@/lib/utils";

interface RiskTotals {
  classes: number;
  enrolled: number;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  atRisk: number;
  rate: number;
}

function summarize(items: ClassRisk[]): RiskTotals {
  return items.reduce<RiskTotals>(
    (totals, item) => ({
      classes: totals.classes + 1,
      enrolled: totals.enrolled + item.enrolled_count,
      sessions: totals.sessions + item.total_sessions,
      present: totals.present + item.present,
      late: totals.late + item.late,
      absent: totals.absent + item.absent,
      atRisk: totals.atRisk + item.at_risk_count,
      rate: totals.rate + item.attendance_rate,
    }),
    {
      classes: 0,
      enrolled: 0,
      sessions: 0,
      present: 0,
      late: 0,
      absent: 0,
      atRisk: 0,
      rate: 0,
    },
  );
}

function rateVariant(rate: number): "success" | "warning" | "destructive" {
  if (rate < 75) return "destructive";
  if (rate < 85) return "warning";
  return "success";
}

export default function ProfessorAtRiskPage() {
  const riskLoader = useCallback(
    () =>
      api.get<unknown>("/professor/classes/risk").then((payload) =>
        normalizePaginated(payload, normalizeClassRisk).items,
      ),
    [],
  );
  const risk = useResource(riskLoader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="At-risk classes"
        description="Monitor attendance and identify students who need follow-up before they fall behind."
        actions={
          <Button variant="outline" onClick={risk.reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <QueryState
        loading={risk.loading}
        error={risk.error}
        data={risk.data}
        onRetry={risk.reload}
        skeleton={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                <Skeleton key={item} className="h-32 rounded-lg" />
              ))}
            </div>
            <Card>
              <TableSkeleton columns={8} />
            </Card>
          </div>
        }
        emptyTitle="No at-risk data"
        emptyDescription="Class attendance summaries appear here once sessions are recorded."
      >
        {(items) => {
          const totals = summarize(items);
          const averageRate = totals.classes > 0 ? totals.rate / totals.classes : 0;

          return (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Classes"
                  value={totals.classes}
                  icon={GraduationCap}
                  description="Classes with attendance data"
                />
                <StatCard
                  title="Enrolled"
                  value={totals.enrolled}
                  icon={Users}
                  description="Students on active rosters"
                />
                <StatCard
                  title="Sessions"
                  value={totals.sessions}
                  icon={CalendarDays}
                  description="Sessions held so far"
                />
                <StatCard
                  title="Average rate"
                  value={percent(averageRate)}
                  icon={BarChart3}
                  description="Across tracked classes"
                  tone={averageRate < 75 ? "rose" : "primary"}
                />
                <StatCard
                  title="Present"
                  value={totals.present}
                  icon={UserCheck}
                  description="Verified check-ins"
                  tone="success"
                />
                <StatCard
                  title="Late"
                  value={totals.late}
                  icon={Clock3}
                  description="Check-ins after the threshold"
                  tone="warning"
                />
                <StatCard
                  title="Absent"
                  value={totals.absent}
                  icon={UserX}
                  description="Recorded absences"
                  tone="rose"
                />
                <StatCard
                  title="At risk"
                  value={totals.atRisk}
                  icon={AlertTriangle}
                  description="Students below the threshold"
                  tone={totals.atRisk > 0 ? "warning" : "sky"}
                />
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Class attendance</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Rates below 75% are highlighted for immediate follow-up.
                    </p>
                  </div>
                  <Badge variant="outline">{items.length} class(es)</Badge>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {items.length === 0 ? (
                    <p className="px-5 pb-6 text-center text-sm text-muted-foreground">
                      No class risk data is available yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Class</TableHead>
                          <TableHead>Enrolled</TableHead>
                          <TableHead>Sessions</TableHead>
                          <TableHead>Present</TableHead>
                          <TableHead>Late</TableHead>
                          <TableHead>Absent</TableHead>
                          <TableHead>Attendance rate</TableHead>
                          <TableHead>At risk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, index) => {
                          const variant = rateVariant(item.attendance_rate);
                          return (
                            <TableRow
                              key={item.class_id || `${item.course_code}-${index}`}
                              className={cn(
                                item.attendance_rate < 75 && "bg-destructive/5",
                              )}
                            >
                              <TableCell>
                                <Button variant="link" size="sm" asChild className="h-auto p-0">
                                  <Link href={`/professor/sessions?class_id=${item.class_id}`}>
                                    {item.course_code ? `${item.course_code} · ` : ""}
                                    {item.course_name || "Class"}
                                  </Link>
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                  {item.section || "No section"}
                                </p>
                              </TableCell>
                              <TableCell>{item.enrolled_count}</TableCell>
                              <TableCell>{item.total_sessions}</TableCell>
                              <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">
                                {item.present}
                              </TableCell>
                              <TableCell className="font-medium text-amber-600 dark:text-amber-400">
                                {item.late}
                              </TableCell>
                              <TableCell className="font-medium text-rose-600 dark:text-rose-400">
                                {item.absent}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge variant={variant} className="min-w-12 justify-center">
                                    {percent(item.attendance_rate)}
                                  </Badge>
                                  <Progress
                                    value={item.attendance_rate}
                                    className="w-20"
                                    indicatorClassName={cn(
                                      variant === "destructive" && "bg-rose-500",
                                      variant === "warning" && "bg-amber-500",
                                    )}
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={item.at_risk_count > 0 ? "destructive" : "secondary"}
                                >
                                  {item.at_risk_count}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
