"use client";

import { ClipboardCheck, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import {
  normalizeClass,
  normalizeClassProfessor,
  normalizeFacultyMember,
  normalizePaginated,
} from "@/lib/normalize";
import type { ClassProfessor, ClassItem, FacultyMember } from "@/lib/types";

export default function FacultyAssignmentsPage() {
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedProfessor, setSelectedProfessor] = useState("");
  const [assigned, setAssigned] = useState<ClassProfessor[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const classesLoader = useCallback(
    () =>
      api.getPaginated<ClassItem>("/admin/classes", normalizeClass, {
        query: { page_size: 100 },
      }),
    [],
  );
  const classes = useResource(classesLoader);

  const facultyLoader = useCallback(
    () =>
      api
        .get<unknown>("/admin/faculty", { query: { page_size: 100 } })
        .then((payload) => normalizePaginated(payload, normalizeFacultyMember).items),
    [],
  );
  const faculty = useResource<FacultyMember[]>(facultyLoader);

  useEffect(() => {
    if (!selectedClassId) {
      setAssigned([]);
      return;
    }
    let active = true;
    setLoadingAssignments(true);
    setAssignError(null);
    api
      .get<unknown>(`/admin/classes/${selectedClassId}/professors`)
      .then((payload) => {
        if (active) setAssigned((payload as unknown[]).map(normalizeClassProfessor));
      })
      .catch((error: unknown) => {
        if (active) setAssignError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingAssignments(false);
      });
    return () => {
      active = false;
    };
  }, [selectedClassId]);

  const selectedClass = (classes.data?.items ?? []).find((item) => item.id === selectedClassId);

  const availableFaculty = (faculty.data ?? []).filter(
    (professor) => !assigned.some((item) => item.professor_id === professor.id),
  );

  const handleAssign = async () => {
    if (!selectedClassId || !selectedProfessor) {
      setAssignError("Choose a class and professor first.");
      return;
    }
    setLoadingAssignments(true);
    setAssignError(null);
    try {
      await api.post(`/admin/classes/${selectedClassId}/professors/${selectedProfessor}`);
      toast.success("Professor assigned to class");
      setSelectedProfessor("");
      const payload = await api.get<unknown>(`/admin/classes/${selectedClassId}/professors`);
      setAssigned((payload as unknown[]).map(normalizeClassProfessor));
      classes.reload();
    } catch (error) {
      setAssignError(errorMessage(error));
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleUnassign = async (professorId: string) => {
    if (!selectedClassId) return;
    setLoadingAssignments(true);
    setAssignError(null);
    try {
      await api.delete(`/admin/classes/${selectedClassId}/professors/${professorId}`);
      toast.success("Professor unassigned");
      const payload = await api.get<unknown>(`/admin/classes/${selectedClassId}/professors`);
      setAssigned((payload as unknown[]).map(normalizeClassProfessor));
      classes.reload();
    } catch (error) {
      setAssignError(errorMessage(error));
    } finally {
      setLoadingAssignments(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Class assignments"
        description="Give additional faculty access to selected class sections and attendance sessions."
        actions={
          <Button variant="outline" onClick={() => { classes.reload(); faculty.reload(); }}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Class section</p>
            <Select value={selectedClassId || "none"} onValueChange={(value) => setSelectedClassId(value === "none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a class</SelectItem>
                {(classes.data?.items ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.course_name || "No course"} · {item.semester || item.term || "No term"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Add professor</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedProfessor || "none"} onValueChange={(value) => setSelectedProfessor(value === "none" ? "" : value)}>
                <SelectTrigger className="sm:flex-1">
                  <SelectValue placeholder="Choose professor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose professor</SelectItem>
                  {availableFaculty.map((professor) => (
                    <SelectItem key={professor.id} value={professor.id}>
                      {professor.full_name} · {professor.employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void handleAssign()} loading={loadingAssignments} disabled={!selectedClassId || !selectedProfessor}>
                <UserPlus /> Assign
              </Button>
            </div>
          </div>
        </div>
        {selectedClass ? (
          <p className="text-xs text-muted-foreground">
            Primary professor: {selectedClass.professor_name || "Unassigned"} · Semester: {selectedClass.semester || selectedClass.term || "—"}
          </p>
        ) : null}
        {assignError ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {assignError}
          </p>
        ) : null}
      </Card>

      <Card>
        <QueryState
          loading={classes.loading || faculty.loading}
          error={classes.error ?? faculty.error}
          data={classes.data && faculty.data ? selectedClassId : null}
          onRetry={() => { classes.reload(); faculty.reload(); }}
          skeleton={<TableSkeleton columns={5} />}
          emptyTitle="No class selected"
          emptyDescription="Choose a class section to review its professors."
        >
          {() =>
            loadingAssignments ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading assignments…</div>
            ) : assigned.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No additional professors assigned to this class.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Professor</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assigned.map((professor) => (
                    <TableRow key={professor.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="size-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{professor.full_name}</p>
                            <p className="text-xs text-muted-foreground">{professor.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{professor.employee_id}</TableCell>
                      <TableCell className="text-muted-foreground">{professor.department_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={selectedClass?.professor_id === professor.professor_id ? "info" : "secondary"}>
                          {selectedClass?.professor_id === professor.professor_id ? "Primary" : "Additional"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Unassign ${professor.full_name}`}
                          loading={loadingAssignments}
                          onClick={() => void handleUnassign(professor.professor_id)}
                        >
                          <UserMinus className="text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryState>
      </Card>
    </div>
  );
}
