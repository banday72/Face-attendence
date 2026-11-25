"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { NameValue } from "@/lib/types";

interface AttendanceBarChartProps {
  data: NameValue[];
  title?: string;
  description?: string;
  height?: number;
  suffix?: string;
}

export function AttendanceBarChart({
  data,
  title = "Attendance by group",
  description = "Comparison across academic groups",
  height = 260,
  suffix = "",
}: AttendanceBarChartProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            title="No comparison data"
            description="Group-level analytics will show here once data is available."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barSize={26}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={data.length > 5 ? -20 : 0}
                  textAnchor={data.length > 5 ? "end" : "middle"}
                  height={data.length > 5 ? 60 : 30}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--coral))", fillOpacity: 0.08 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                    fontSize: 12,
                  }}
                  formatter={(value: number | string) => [`${value}${suffix}`, "Value"]}
                />
                <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
