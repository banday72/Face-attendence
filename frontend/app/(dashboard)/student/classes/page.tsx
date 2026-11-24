"use client";

import { BookOpen, CalendarDays, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeAttendanceSummary, normalizeClass, normalizePaginated } from "@/lib/normalize";
import { formatTime, percent } from "@/lib/utils";

export default function StudentClassesPage() {
  const loader = useCallback(async () => {
    const [classesPayload, attendancePayload] = await Promise.all([
      api.get<unknown>("/student/classes", { query: { page_size: 200 } }),
      api.get<unknown>("/attendance/me"),
    ]);
    const classes = normalizePaginated(classesPayload, normalizeClass).items;
    const summary = normalizeAttendanceSummary(attendancePayload);
    return { classes, summary };
  }, []);
  const resource = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="My classes"
        description="Courses you are enrolled in and how you are performing in each one."
        actions={
          <Button variant="outline" asChild>
            <Link href="/student/schedule">Weekly schedule</Link>
          </Button>
        }
      />

      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-56 rounded-lg" />
            ))}
          </div>
        }
        emptyTitle="No enrolled classes"
        emptyDescription="Ask your department to enroll you in your semester classes."
      >
        {(data) => (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.classes.map((item) => {
              const progress = data.summary.percentages.find(
                (entry) =>
                  entry.class_id === item.id ||
                  entry.course_id === item.course_id ||
                  entry.course_name === item.course_name,
              );
              const rate = progress?.percentage ?? 0;
              return (
                <Card key={item.id} className="flex flex-col hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <BookOpen className="size-5" />
                      </span>
                      <Badge variant={rate >= 75 ? "success" : "warning"}>{percent(rate)}</Badge>
                    </div>
                    <CardTitle className="mt-3 text-lg">{item.course_name || item.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {item.name} · {item.section || item.code || "Section"}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-3">
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <GraduationCap className="size-3.5" /> {item.professor_name || "Professor TBA"}
                      </p>
                      <p className="flex items-center gap-2">
                        <CalendarDays className="size-3.5" />
                        {item.schedule_days.length ? item.schedule_days.join(", ") : "Schedule TBA"} ·{" "}
                        {formatTime(item.start_time)} – {formatTime(item.end_time)}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="size-3.5" /> {item.classroom_name || "Room TBA"}
                      </p>
                    </div>
                    <div className="mt-auto space-y-1.5 border-t border-border pt-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Attendance</span>
                        <span className="font-semibold">{percent(rate)}</span>
                      </div>
                      <Progress
                        value={rate}
                        indicatorClassName={rate < 75 ? "bg-destructive" : undefined}
                      />
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        {progress
                          ? `${progress.present} present · ${progress.late} late · ${progress.absent} absent`
                          : "No attendance records yet"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
