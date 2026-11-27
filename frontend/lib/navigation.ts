import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarClock,
  Camera,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  History,
  LayoutDashboard,
  QrCode,
  ScanFace,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigation: Record<Role, NavGroup[]> = {
  admin: [
    {
      label: "Overview",
      items: [
        {
          label: "Dashboard",
          href: "/admin",
          icon: LayoutDashboard,
          description: "System-wide attendance insights",
        },
        {
          label: "Reports",
          href: "/admin/reports",
          icon: FileBarChart,
          description: "Analytics and exports",
        },
        {
          label: "Correction reviews",
          href: "/admin/correction-requests",
          icon: ClipboardList,
          description: "Student attendance correction queue",
        },
      ],
    },
    {
      label: "Management",
      items: [
        {
          label: "Departments",
          href: "/admin/departments",
          icon: Settings2,
        },
        { label: "Users", href: "/admin/users", icon: Users },
        { label: "Semesters", href: "/admin/semesters", icon: CalendarClock },
        { label: "Faculty", href: "/admin/faculty", icon: Users },
        { label: "Class assignments", href: "/admin/faculty-assignments", icon: ClipboardList },
        { label: "Courses", href: "/admin/courses", icon: BookOpen },
        { label: "Subjects", href: "/admin/subjects", icon: BookOpen },
        { label: "Classes", href: "/admin/classes", icon: GraduationCap },
        { label: "Classrooms", href: "/admin/classrooms", icon: Settings2 },
        { label: "Timetable", href: "/admin/timetable", icon: CalendarClock },
        { label: "Holidays", href: "/admin/holidays", icon: CalendarClock },
        { label: "Student faces", href: "/admin/student-faces", icon: ScanFace },
      ],
    },
    {
      label: "Governance",
      items: [
        { label: "Audit logs", href: "/admin/audit-logs", icon: ScrollText },
      ],
    },
  ],
  professor: [
    {
      label: "Teaching",
      items: [
        {
          label: "Dashboard",
          href: "/professor",
          icon: LayoutDashboard,
          description: "Your classes at a glance",
        },
        { label: "My classes", href: "/professor/classes", icon: GraduationCap },
        { label: "Sessions", href: "/professor/sessions", icon: CalendarClock },
        { label: "Students", href: "/professor/students", icon: Users },
        { label: "At-risk classes", href: "/professor/at-risk", icon: AlertTriangle },
      ],
    },
    {
      label: "Insights",
      items: [
        { label: "History", href: "/professor/history", icon: History },
        { label: "Reports", href: "/professor/reports", icon: BarChart3 },
        {
          label: "Correction reviews",
          href: "/professor/correction-requests",
          icon: ClipboardList,
        },
      ],
    },
  ],
  student: [
    {
      label: "Attendance",
      items: [
        {
          label: "Dashboard",
          href: "/student",
          icon: LayoutDashboard,
          description: "Your attendance overview",
        },
        { label: "My classes", href: "/student/classes", icon: BookOpen },
        { label: "Schedule", href: "/student/schedule", icon: CalendarClock },
        { label: "History", href: "/student/history", icon: History },
        {
          label: "Correction requests",
          href: "/student/correction-requests",
          icon: ClipboardList,
        },
      ],
    },
    {
      label: "Check in",
      items: [
        { label: "Scan QR", href: "/student/scan", icon: QrCode },
        { label: "Face check-in", href: "/student/face-attendance", icon: ScanFace },
        { label: "Register face", href: "/student/face-register", icon: Camera },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Profile", href: "/student/profile", icon: UserRound },
        { label: "Privacy & face data", href: "/student/privacy", icon: ShieldCheck },
      ],
    },
  ],
};

export function navItemsForRole(role: Role): NavItem[] {
  return navigation[role].flatMap((group) => group.items);
}

export function homeForRole(role: Role): string {
  return `/${role}`;
}

export function requiredRoleForPath(pathname: string): Role | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/professor")) return "professor";
  if (pathname.startsWith("/student")) return "student";
  return null;
}

export function breadcrumbsForPath(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  const labels = segments.map((segment) =>
    segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
  );
  return labels.length ? ["Home", ...labels] : ["Home"];
}

export const quickActions: Record<Role, NavItem[]> = {
  admin: [
    { label: "Create class", href: "/admin/classes", icon: GraduationCap },
    { label: "Manage timetable", href: "/admin/timetable", icon: CalendarClock },
    { label: "Enroll student face", href: "/admin/student-faces", icon: ScanFace },
    { label: "View reports", href: "/admin/reports", icon: FileBarChart },
  ],
  professor: [
    { label: "New session", href: "/professor/sessions", icon: CalendarClock },
    { label: "View students", href: "/professor/students", icon: Users },
    { label: "History", href: "/professor/history", icon: ClipboardList },
  ],
  student: [
    { label: "Scan QR", href: "/student/scan", icon: QrCode },
    { label: "Face check-in", href: "/student/face-attendance", icon: ScanFace },
    { label: "My history", href: "/student/history", icon: History },
  ],
};
