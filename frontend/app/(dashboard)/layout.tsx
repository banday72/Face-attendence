"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth-context";
import { homeForRole, requiredRoleForPath } from "@/lib/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const requiredRole = requiredRoleForPath(pathname);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user && requiredRole && user.role !== requiredRole) {
      router.replace(homeForRole(user.role));
    }
  }, [requiredRole, router, status, user]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs font-medium text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!user || (requiredRole && user.role !== requiredRole)) return null;

  return <DashboardShell>{children}</DashboardShell>;
}
