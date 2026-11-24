import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "purple" | "sky" | "rose";

const tones: Record<Tone, string> = {
  primary: "from-indigo-500/18 to-violet-500/8 text-indigo-600 dark:text-indigo-400",
  success: "from-emerald-500/18 to-teal-500/8 text-emerald-600 dark:text-emerald-400",
  warning: "from-amber-500/20 to-orange-500/8 text-amber-600 dark:text-amber-400",
  purple: "from-violet-500/18 to-fuchsia-500/8 text-violet-600 dark:text-violet-400",
  sky: "from-sky-500/18 to-cyan-500/8 text-sky-600 dark:text-sky-400",
  rose: "from-rose-500/18 to-pink-500/8 text-rose-600 dark:text-rose-400",
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
    <Card className={cn("group relative overflow-hidden p-5 hover:-translate-y-0.5 hover:shadow-glow", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
        </div>
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
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
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
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
