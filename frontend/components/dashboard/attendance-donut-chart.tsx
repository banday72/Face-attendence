"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { NameValue } from "@/lib/types";

const colors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface DonutChartProps {
  data: NameValue[];
  title?: string;
  description?: string;
  centerLabel?: string;
  centerValue?: string | number;
  height?: number;
}

export function AttendanceDonutChart({
  data,
  title = "Attendance breakdown",
  description = "Records by status",
  centerLabel = "Records",
  centerValue,
  height = 240,
}: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 || total === 0 ? (
          <EmptyState
            title="No records to display"
            description="The distribution will appear once attendance is recorded."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <>
            <div className="relative" style={{ height }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={3}
                    stroke="none"
                  >
                    {data.map((item, index) => (
                      <Cell key={`${item.name}-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tracking-tight">{centerValue ?? total}</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {centerLabel}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {data.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: colors[index % colors.length] }} />
                  <span className="capitalize">{item.name.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
