"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { TrendPoint } from "@/lib/types";

interface AttendanceTrendChartProps {
  data: TrendPoint[];
  title?: string;
  description?: string;
  height?: number;
}

export function AttendanceTrendChart({
  data,
  title = "Attendance trend",
  description = "Check-in activity over the selected period",
  height = 260,
}: AttendanceTrendChartProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            title="No trend data yet"
            description="Attendance activity will be charted here as sessions are recorded."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--coral))", strokeOpacity: 0.35, strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                    fontSize: 12,
                    boxShadow: "0 12px 30px rgba(15,23,42,.18)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2.5}
                  fill="url(#attendanceFill)"
                  activeDot={{ r: 5, fill: "hsl(var(--coral))", stroke: "hsl(var(--cream-bright))", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
