"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { errorMessage } from "@/lib/api";

interface QueryStateProps<T> {
  loading: boolean;
  error: Error | null;
  data: T | null | undefined;
  skeleton: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}

export function QueryState<T>({
  loading,
  error,
  data,
  skeleton,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
}: QueryStateProps<T>) {
  if (loading) return <>{skeleton}</>;

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto size-6 text-destructive" />
        <p className="mt-3 font-semibold">Could not load data</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {errorMessage(error)}
        </p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        ) : null}
      </div>
    );
  }

  if (!data) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children(data)}</>;
}
