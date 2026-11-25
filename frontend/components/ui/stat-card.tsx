import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "purple" | "sky" | "rose";

const tones: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-navy/10 text-navy dark:bg-cream/10 dark:text-cream",
  warning: "bg-coral/12 text-coral-strong",
  purple: "bg-secondary text-secondary-foreground",
  sky: "bg-muted text-foreground",
  rose: "bg-coral/10 text-coral-strong",
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: number;
  tone?: Tone;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  tone = "primary",
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className={cn("p-5", className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-5 h-8 w-20" />
        <Skeleton className="mt-4 h-3 w-32" />
      </Card>
    );
  }

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            tones[tone],
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        {trend !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              trend >= 0
                ? "bg-primary/10 text-primary"
                : "bg-coral/12 text-coral-strong",
            )}
          >
            {trend >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend)}%
          </span>
        ) : null}
        {description ? <span className="truncate">{description}</span> : null}
      </div>
    </Card>
  );
}
