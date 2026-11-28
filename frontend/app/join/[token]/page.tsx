"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LegacyJoinPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/register");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      Opening the student registration form…
    </main>
  );
}
