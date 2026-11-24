import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: number;
  tone?: "primary" | "success" | "warning" | "purple" | "sky" | "rose";
  href?: string;
  loading?: boolean;
  className?: string;
}

export function DashboardStatCard(props: DashboardStatCardProps) {
  const { href, className, ...statProps } = props;
  if (!href) return <StatCard {...statProps} className={className} />;
  return (
    <Link href={href} className={cn("block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <StatCard {...statProps} />
      <span className="sr-only">
        Open <ArrowUpRight />
      </span>
    </Link>
  );
}
