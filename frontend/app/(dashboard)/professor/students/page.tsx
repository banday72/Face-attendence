"use client";

import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { isRecord, normalizeClass, normalizeRosterEntry } from "@/lib/normalize";
import type { RosterEntry } from "@/lib/types";
import { initials } from "@/lib/utils";

interface StudentRow {
  student_id: string;
  name: string;
  university_id: string;
  classes: string[];
  present: number;
  late: number;
  absent: number;
}

export default function ProfessorStudentsPage() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const loader = useCallback(async () => {
    const classes = await api.getAll("/professor/classes", normalizeClass);
    const rosters = await Promise.all(
      classes.map(async (item) => {
        try {
          const payload = await api.get<unknown>(`/attendance/classes/${item.id}`);
          const entries = isRecord(payload) && Array.isArray(payload.roster)
            ? payload.roster.map(normalizeRosterEntry)
            : [];
          return { classItem: item, entries };
        } catch {
          return { classItem: item, entries: [] as RosterEntry[] };
        }
      }),
    );

    const rows: StudentRow[] = [];
    rosters.forEach(({ classItem, entries }) => {
      entries.forEach((entry) => {
        const key = entry.student_id || entry.university_id || entry.student_name;
        if (!key) return;
        let row = rows.find((candidate) => candidate.student_id === key);
        if (!row) {
          row = {
            student_id: key,
            name: entry.student_name || "Student",
            university_id: entry.university_id || "",
            classes: [],
            present: 0,
            late: 0,
            absent: 0,
          };
          rows.push(row);
        }
        if (!row.classes.includes(classItem.name)) row.classes.push(classItem.name);
        if (entry.record?.status === "present") row.present += 1;
        if (entry.record?.status === "late") row.late += 1;
        if (entry.record?.status === "absent") row.absent += 1;
      });
    });
    return { classes, rows };
  }, []);
  const resource = useResource(loader);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (resource.data?.rows ?? []).filter((row) => {
      const matchesSearch =
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.university_id.toLowerCase().includes(query);
      const matchesClass = !classFilter || row.classes.some((name) =>
        (resource.data?.classes.find((item) => item.id === classFilter)?.name ?? "") === name,
      );
      return matchesSearch && matchesClass;
    });
  }, [classFilter, resource.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="Students"
        description="A consolidated view of students enrolled across your classes."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or university ID…"
              className="pl-9"
            />
          </div>
          <Select value={classFilter || "all"} onValueChange={(value) => setClassFilter(value === "all" ? "" : value)}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(resource.data?.classes ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="ml-auto text-xs text-muted-foreground">{filtered.length} student(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-8 animate-pulse rounded bg-muted/60" />)}</div>}
          emptyTitle="No students found"
          emptyDescription="Students appear here once they are enrolled in one of your classes."
        >
          {() =>
            filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No students match your filters.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead className="w-48">Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const total = row.present + row.late + row.absent;
                    const rate = total ? ((row.present + row.late) / total) * 100 : 0;
                    return (
                      <TableRow key={row.student_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                              {initials(row.name)}
                            </span>
                            <div>
                              <p className="font-medium">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.university_id || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {row.classes.map((name) => (
                              <Badge key={name} variant="secondary" className="text-[10px]">{name}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">{row.present}</TableCell>
                        <TableCell className="font-medium text-amber-600 dark:text-amber-400">{row.late}</TableCell>
                        <TableCell className="font-medium text-rose-600 dark:text-rose-400">{row.absent}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={rate} className="h-1.5" />
                            <span className="w-9 text-right text-xs font-semibold">{Math.round(rate)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          }
        </QueryState>
      </Card>
    </div>
  );
}
