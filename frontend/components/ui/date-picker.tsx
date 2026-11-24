"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  type?: "date" | "datetime-local" | "time";
  min?: string;
  max?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DatePicker({
  label,
  value,
  onChange,
  type = "date",
  min,
  max,
  error,
  disabled,
  className,
  id,
}: DatePickerProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={inputId}>{label}</Label> : null}
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          type={type}
          value={value ?? ""}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "flex h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:opacity-50",
            error && "border-destructive",
          )}
        />
      </div>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
