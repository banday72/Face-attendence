"use client";

import { Eye, RefreshCw, ScrollText, Search } from "lucide-react";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeAuditLog } from "@/lib/normalize";
import type { AuditLog } from "@/lib/types";
import { formatDateTime, truncate } from "@/lib/utils";

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const loader = useCallback(
    () =>
      api.getPaginated<AuditLog>("/admin/audit-logs", normalizeAuditLog, {
        query: {
          page,
          page_size: 20,
          search: debouncedSearch || undefined,
          action: action || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
      }),
    [action, debouncedSearch, fromDate, page, toDate],
  );
  const resource = useResource(loader);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Audit logs"
        description="Review every administrative change with actor, reason, and before/after values."
        actions={
          <Button variant="outline" onClick={resource.reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search logs…"
              className="pl-9"
            />
          </div>
          <Select
            value={action || "all"}
            onValueChange={(value) => {
              setAction(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {["create", "update", "delete", "correction", "enroll", "unenroll"].map((item) => (
                <SelectItem key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker
            label="From"
            value={fromDate}
            onChange={(value) => {
              setFromDate(value);
              setPage(1);
            }}
          />
          <DatePicker
            label="To"
            value={toDate}
            onChange={(value) => {
              setToDate(value);
              setPage(1);
            }}
          />
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSearch("");
                setAction("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <QueryState
          loading={resource.loading}
          error={resource.error}
          data={resource.data}
          onRetry={resource.reload}
          skeleton={<TableSkeleton columns={6} />}
          emptyTitle="No audit logs"
          emptyDescription="Administrative changes will be recorded here."
        >
          {(data) =>
            data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No logs match your filters.</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                              <ScrollText className="size-3.5 text-muted-foreground" />
                            </span>
                            <span className="font-medium">{log.actor_name || "System"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{log.action || "change"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.entity_type || "—"}
                          {log.entity_id ? (
                            <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                              #{truncate(log.entity_id, 8)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {log.reason || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="View audit detail"
                            onClick={() => setDetail(log)}
                          >
                            <Eye />
                          </Button>
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

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Audit entry</DialogTitle>
            <DialogDescription>
              {detail?.action || "Change"} by {detail?.actor_name || "System"} ·{" "}
              {formatDateTime(detail?.created_at)}
            </DialogDescription>
          </DialogHeader>
          {detail?.reason ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <span className="font-semibold">Reason: </span>{detail.reason}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before</p>
              <pre className="scrollbar-thin max-h-72 overflow-auto rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(detail?.before ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">After</p>
              <pre className="scrollbar-thin max-h-72 overflow-auto rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(detail?.after ?? {}, null, 2)}
              </pre>
            </div>
          </div>
          {detail?.ip_address ? (
            <p className="text-xs text-muted-foreground">IP address: {detail.ip_address}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
