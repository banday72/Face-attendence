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
  admin: "bg-amber-400/15 text-amber-300 ring-amber-300/25",
  professor: "bg-sky-400/15 text-sky-300 ring-sky-300/25",
  student: "bg-violet-400/15 text-violet-300 ring-violet-300/25",
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
        <div className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 shadow-lg shadow-indigo-950/40">
          <GraduationCap className="size-5 text-white" />
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar" />
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
          className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10"
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
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-sidebar-accent/15 text-white shadow-[inset_2px_0_0_hsl(var(--sidebar-accent))]"
                        : "text-sidebar-muted hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active ? "text-indigo-300" : "text-sidebar-muted group-hover:text-white",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {active ? (
                      <span className="ml-auto size-1.5 rounded-full bg-indigo-300" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="rounded-xl bg-gradient-to-br from-white/10 to-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-indigo-300" />
            <p className="text-xs font-semibold">Need a hand?</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-sidebar-muted">
            Ask your department coordinator for access or attendance corrections.
          </p>
          <Badge className="mt-3 border-white/10 bg-white/5 text-[10px] text-sidebar-muted" variant="outline">
            Secure session active
          </Badge>
        </div>
      </div>
    </div>
  );
}
