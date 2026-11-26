"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  options: SearchableOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  id,
  value,
  options,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search options",
  emptyText = "No matches found",
  allowEmpty = false,
  emptyLabel = "None",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function choose(next: string) {
    onValueChange(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">
          {selected?.label ?? (allowEmpty && !value ? emptyLabel : placeholder)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-soft">
          <div className="relative border-b border-border">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => choose("")}
                className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span>{emptyLabel}</span>
                {!value ? <Check className="size-4" /> : null}
              </button>
            ) : null}
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {value === option.value ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))}
            {!filtered.length ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
