import {
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
        { label: "Courses", href: "/admin/courses", icon: BookOpen },
        { label: "Classes", href: "/admin/classes", icon: GraduationCap },
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
      ],
    },
    {
      label: "Insights",
      items: [
        { label: "History", href: "/professor/history", icon: History },
        { label: "Reports", href: "/professor/reports", icon: BarChart3 },
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
    { label: "Add user", href: "/admin/users", icon: Users },
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
