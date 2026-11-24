import { clsx, type ClassValue } from "clsx";
import { format, isValid, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string, pattern = "MMM d, yyyy"): string {
  if (!value) return "—";
  const date = value.includes("T") ? parseISO(value) : new Date(value);
  return isValid(date) ? format(date, pattern) : "—";
}

export function formatDateTime(value?: string): string {
  return formatDate(value, "MMM d, yyyy · h:mm a");
}

export function formatTime(value?: string): string {
  if (!value) return "—";
  const time = value.slice(0, 8);
  const date = new Date(`1970-01-01T${time}`);
  return isValid(date) ? format(date, "h:mm a") : value;
}

export function toDateTimeLocal(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function truncate(text: string, length = 60): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
