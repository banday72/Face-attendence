"use client";

import { CalendarDays, Clock, MapPin } from "lucide-react";
import { useCallback } from "react";
import { format } from "date-fns";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeSchedule } from "@/lib/normalize";
import type { ScheduleItem } from "@/lib/types";
import { formatTime } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayNames: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export default function StudentSchedulePage() {
  const loader = useCallback(() => api.getAll("/student/schedule", normalizeSchedule), []);
  const resource = useResource(loader);
  const today = format(new Date(), "EEE");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Weekly schedule"
        description="Your enrolled classes arranged by day, based on the timetable published by your department."
      />

      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={<Skeleton className="h-96 rounded-lg" />}
        emptyTitle="No timetable available"
        emptyDescription="Your classes have not published meeting days yet. Check back after registration."
      >
        {(items) => {
          const scheduled = items.filter(
            (item) => Number.isFinite(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6,
          );
          if (!scheduled.length) {
            return (
              <EmptyState
                title="No timetable available"
                description="Your classes have not published meeting days yet. Check back after registration."
                icon={CalendarDays}
              />
            );
          }
          return (
            <Tabs defaultValue={today} className="space-y-4">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                {DAYS.map((day) => (
                  <TabsTrigger key={day} value={day} className="min-w-[72px]">
                    {dayNames[day]}
                    {day === today ? <span className="ml-1 size-1.5 rounded-full bg-primary" /> : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              {DAYS.map((day, index) => {
                const dayItems: ScheduleItem[] = scheduled
                  .filter((item) => item.day_of_week === index)
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <TabsContent key={day} value={day} className="space-y-3">
                    {dayItems.length === 0 ? (
                      <EmptyState
                        title={`No classes on ${dayNames[day]}`}
                        description="Use another day tab to view your timetable."
                        icon={CalendarDays}
                      />
                    ) : (
                      dayItems.map((item) => (
                        <Card key={item.id} className="overflow-hidden">
                          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                            <div className="flex w-full shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 px-4 py-3 text-primary sm:w-32">
                              <p className="text-xs font-semibold uppercase tracking-wider">{dayNames[day]}</p>
                              <p className="mt-1 text-sm font-bold">{formatTime(item.start_time)}</p>
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold">{item.course_name || item.class_name}</h3>
                                {item.class_name ? <Badge variant="secondary">{item.class_name}</Badge> : null}
                              </div>
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <Clock className="size-3.5" /> {formatTime(item.start_time)} – {formatTime(item.end_time)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="size-3.5" /> {item.classroom_name || "Room TBA"}
                                </span>
                                {item.professor_name ? (
                                  <span>Prof. {item.professor_name}</span>
                                ) : null}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          );
        }}
      </QueryState>
    </div>
  );
}
