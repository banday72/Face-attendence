"use client";

import {
  Fingerprint,
  GraduationCap,
  LifeBuoy,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { navigation, homeForRole } from "@/lib/navigation";
import type { Role } from "@/lib/types";
import { cn, roleLabel } from "@/lib/utils";

interface SidebarProps {
  role: Role;
  pathname: string;
  onNavigate?: () => void;
}

const roleStyles: Record<Role, string> = {
  admin: "bg-amber-500/15 text-amber-200 ring-amber-400/20",
  professor: "bg-blue-500/15 text-blue-200 ring-blue-400/20",
  student: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20",
};

const roleIcons: Record<Role, LucideIcon> = {
  admin: ShieldCheck,
  professor: GraduationCap,
  student: Fingerprint,
};

export function Sidebar({ role, pathname, onNavigate }: SidebarProps) {
  const groups = navigation[role];
  const RoleIcon = roleIcons[role];

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-accent text-white">
          <GraduationCap className="size-5" />
        </div>
        <div>
          <p className="text-[17px] font-bold leading-tight tracking-tight">Attendly</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-muted">
            Smart campus
          </p>
        </div>
      </div>

      <div className="px-4 pt-5">
        <Link
          href={homeForRole(role)}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/10 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/15"
        >
          <div className={cn("flex size-8 items-center justify-center rounded-lg ring-1", roleStyles[role])}>
            <RoleIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{roleLabel(role)} portal</p>
            <p className="truncate text-[11px] text-sidebar-muted">Workspace access</p>
          </div>
          <span className="size-1.5 rounded-full bg-emerald-400" />
        </Link>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted/80">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== homeForRole(role) && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-sidebar-accent bg-sidebar-accent/15 text-white"
                        : "border-transparent text-sidebar-muted hover:bg-sidebar-accent/10 hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active ? "text-sidebar-accent" : "text-sidebar-muted group-hover:text-white",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {active ? (
                      <span className="ml-auto size-1.5 rounded-full bg-sidebar-accent" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/5 p-4">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-sidebar-accent" />
            <p className="text-xs font-semibold">Need a hand?</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-sidebar-muted">
            Ask your department coordinator for access or attendance corrections.
          </p>
          <Badge className="mt-3 border-sidebar-border bg-sidebar-accent/10 text-[10px] text-sidebar-muted" variant="outline">
            Secure session active
          </Badge>
        </div>
      </div>
    </div>
  );
}
