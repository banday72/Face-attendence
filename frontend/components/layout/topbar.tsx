"use client";

import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeAlerts } from "@/lib/normalize";
import { breadcrumbsForPath, navItemsForRole } from "@/lib/navigation";
import type { Role, User } from "@/lib/types";
import { cn, initials, roleLabel } from "@/lib/utils";

interface TopbarProps {
  user: User;
  pathname: string;
  onMenuClick: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

export function Topbar({
  user,
  pathname,
  onMenuClick,
  onLogout,
  loggingOut,
}: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const breadcrumbs = breadcrumbsForPath(pathname);
  const results = navItemsForRole(user.role as Role)
    .filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 6);
  const alertsLoader = useCallback(
    () => api.get<unknown>("/me/alerts").then(normalizeAlerts),
    [],
  );
  const alerts = useResource(alertsLoader);
  const { reload: reloadAlerts } = alerts;
  const alertCount = alerts.data?.length ?? 0;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => reloadAlerts(), 60_000);
    return () => window.clearInterval(timer);
  }, [reloadAlerts]);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={onMenuClick}
      >
        <Menu />
      </Button>

      <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm xl:flex">
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3.5 text-muted-foreground/60" /> : null}
            <span
              className={cn(
                "truncate",
                index === breadcrumbs.length - 1
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="relative ml-auto w-full max-w-xs sm:max-w-sm" ref={searchRef}>
        <Image
          src="/assets/logo.png"
          alt=""
          width={18}
          height={18}
          className="pointer-events-none absolute left-2.5 top-1/2 size-[18px] -translate-y-1/2 rounded-sm"
        />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search pages…"
          aria-label="Search pages"
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
        {searchOpen && search.trim() ? (
          <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-md border border-border bg-popover p-1.5 shadow-soft">
            {results.length ? (
              results.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setSearch("");
                      setSearchOpen(false);
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <Icon className="size-4 text-primary" />
                    <span className="font-medium">{item.label}</span>
                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                  </Link>
                );
              })
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching pages
              </p>
            )}
          </div>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(mounted && resolvedTheme === "dark" ? "light" : "dark")}
      >
        {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${alertCount ? `, ${alertCount} alerts` : ""}`}
          >
            <Bell />
            {alertCount ? (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-navy">
                {alertCount}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            {alertCount ? <Badge variant="warning">{alertCount} new</Badge> : null}
          </div>
          <DropdownMenuSeparator />
          {alerts.loading ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading alerts…</p>
            ) : alerts.data?.length ? (
              <div className="max-h-80 space-y-1 overflow-auto p-1">
                {alerts.data.map((alert) => (
                  <DropdownMenuItem key={alert.id} asChild={Boolean(alert.href)}>
                    {alert.href ? (
                      <Link href={alert.href} className="flex flex-col items-start gap-1 py-2">
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              alert.severity === "danger"
                                ? "bg-destructive"
                                : alert.severity === "warning"
                                  ? "bg-warning"
                                  : "bg-primary",
                            )}
                          />
                          {alert.title}
                        </span>
                        {alert.description ? (
                          <span className="text-[11px] text-muted-foreground">{alert.description}</span>
                        ) : null}
                      </Link>
                    ) : (
                      <div className="flex flex-col items-start gap-1 py-2">
                        <span className="text-xs font-semibold">{alert.title}</span>
                        {alert.description ? (
                          <span className="text-[11px] text-muted-foreground">{alert.description}</span>
                        ) : null}
                      </div>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                You&apos;re all caught up. Attendance alerts will appear here.
              </p>
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Account menu"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.full_name || user.email)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[130px] truncate text-xs font-semibold">
                {user.full_name || "Account"}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {roleLabel(user.role)}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="normal-case">
            <span className="block text-sm font-semibold text-foreground">{user.full_name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2.5 py-2">
            <Badge variant="secondary" className="capitalize">
              {roleLabel(user.role)} account
            </Badge>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={onLogout}
            disabled={loggingOut}
          >
            <LogOut /> {loggingOut ? "Signing out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
