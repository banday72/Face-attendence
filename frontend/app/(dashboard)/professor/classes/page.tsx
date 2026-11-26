"use client";

import { ArrowRight, CalendarDays, Clock, GraduationCap, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeClass } from "@/lib/normalize";
import { formatTime } from "@/lib/utils";

export default function ProfessorClassesPage() {
  const [search, setSearch] = useState("");
  const loader = useCallback(() => api.getAll("/professor/classes", normalizeClass), []);
  const resource = useResource(loader);
  const classes = (resource.data ?? []).filter((item) =>
    `${item.name} ${item.course_name ?? ""} ${item.code ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="My classes"
        description="Every class assigned to you, with quick access to attendance sessions."
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your classes…"
          className="pl-9"
        />
      </div>

      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-52 rounded-lg" />
            ))}
          </div>
        }
        emptyTitle="No assigned classes"
        emptyDescription="Your department coordinator can assign classes to your account."
      >
        {() =>
          classes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No classes match “{search}”.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classes.map((item) => (
                <Card key={item.id} className="flex flex-col hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <GraduationCap className="size-5" />
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.semester || "Current term"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3 text-lg">{item.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{item.course_name || "Course"}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-3">
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <CalendarDays className="size-3.5" />
                        {item.schedule_days.length ? item.schedule_days.join(", ") : "Schedule not set"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock className="size-3.5" />
                        {formatTime(item.start_time)} – {formatTime(item.end_time)}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="size-3.5" />
                        {item.classroom_name || "Room not assigned"}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                      <span className="text-xs font-medium text-muted-foreground">
                        {Number.isFinite(item.enrolled_count) ? `${item.enrolled_count} students` : "Roster on request"}
                      </span>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/professor/sessions?class_id=${item.id}`}>
                          Sessions <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
