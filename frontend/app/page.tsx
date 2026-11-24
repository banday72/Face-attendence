"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import { homeForRole } from "@/lib/navigation";

export default function HomePage() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    router.replace(status === "authenticated" && user ? homeForRole(user.role) : "/login");
  }, [router, status, user]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
