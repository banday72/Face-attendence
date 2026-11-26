"use client";

import { RefreshCw, Search, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeFacultyMember } from "@/lib/normalize";
import type { FacultyMember } from "@/lib/types";

export default function FacultyPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const loader = useCallback(
    () =>
      api.getPaginated<FacultyMember>("/admin/faculty", normalizeFacultyMember, {
        query: { page, page_size: 20, search: debouncedSearch || undefined },
      }),
    [debouncedSearch, page],
  );
  const resource = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Faculty"
        description="Review teaching staff and their course and class loads."
        actions={
          <>
            <Button variant="outline" onClick={resource.reload}>
              <RefreshCw /> Refresh
            </Button>
            <Button onClick={() => router.push("/admin/faculty-assignments")}>
              <UserRoundCheck /> Class assignments
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search faculty…"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">{resource.data?.total ?? 0} faculty member(s)</p>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error ? new Error(errorMessage(resource.error)) : null}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={6} />}
          emptyTitle="No faculty yet"
          emptyDescription="Create users with the professor role to populate faculty."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No faculty match your search.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Professor</TableHead>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((professor) => (
                      <TableRow key={professor.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{professor.full_name}</p>
                            <p className="text-xs text-muted-foreground">{professor.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{professor.employee_id}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {professor.department_name || "—"}
                        </TableCell>
                        <TableCell>{professor.course_count ?? 0}</TableCell>
                        <TableCell>{professor.class_count ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={professor.is_active ? "info" : "secondary"}>
                            {professor.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  pageSize={data.page_size}
                  onPageChange={setPage}
                />
              </>
            )
          }
        </QueryState>
      </Card>
    </div>
  );
}
