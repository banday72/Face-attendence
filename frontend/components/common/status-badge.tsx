import { Badge } from "@/components/ui/badge";
import type { AttendanceStatus, SessionStatus } from "@/lib/types";

const attendanceVariants: Record<AttendanceStatus, "success" | "warning" | "destructive" | "info"> = {
  present: "success",
  late: "warning",
  absent: "destructive",
  excused: "info",
};

const sessionVariants: Record<SessionStatus, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  scheduled: "warning",
  closed: "secondary",
  cancelled: "destructive",
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return <Badge variant={attendanceVariants[status]}>{status}</Badge>;
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant={sessionVariants[status]}>{status}</Badge>;
}
