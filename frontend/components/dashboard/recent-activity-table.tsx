import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceRecord } from "@/lib/types";
import { formatDateTime, truncate } from "@/lib/utils";

interface RecentActivityTableProps {
  records: AttendanceRecord[];
  title?: string;
  description?: string;
}

const statusVariant = {
  present: "success",
  late: "warning",
  absent: "destructive",
  excused: "info",
} as const;

export function RecentActivityTable({
  records,
  title = "Recent activity",
  description = "Latest attendance records",
}: RecentActivityTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <EmptyState
            title="No recent activity"
            description="Check-ins and corrections will appear here."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.slice(0, 8).map((record, index) => (
                <TableRow key={record.id || index}>
                  <TableCell>
                    <p className="font-medium">{record.student_name || "Student"}</p>
                    <p className="text-xs text-muted-foreground">{record.university_id || "—"}</p>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {truncate(record.class_name || record.course_name || "—", 28)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[record.status]}>{record.status}</Badge>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {record.method || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(record.marked_at || record.date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
