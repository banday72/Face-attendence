"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { homeForRole } from "@/lib/navigation";
import type { Role } from "@/lib/types";

export function AuthGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && user && !allow.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [allow, router, status, user]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === "unauthenticated" || !user || !allow.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
