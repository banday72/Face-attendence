"use client";

import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { DepartmentOption, RegistrationOptions } from "@/lib/types";

interface FormState {
  full_name: string;
  employee_id: string;
  email: string;
  department_id: string;
  title: string;
  office: string;
  password: string;
  confirmPassword: string;
}

const initialState: FormState = {
  full_name: "",
  employee_id: "",
  email: "",
  department_id: "",
  title: "",
  office: "",
  password: "",
  confirmPassword: "",
};

export default function ProfessorRegisterPage() {
  const { registerProfessor, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | "consent", string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<RegistrationOptions>("/auth/registration-options", {
        skipAuth: true,
        signal: controller.signal,
      })
      .then((options) => {
        if (!controller.signal.aborted) setDepartments(options.departments);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<keyof FormState | "consent", string>> = {};
    if (form.full_name.trim().length < 3) next.full_name = "Enter your full name.";
    if (!form.employee_id.trim()) next.employee_id = "Employee ID is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    const byteLength = new TextEncoder().encode(form.password).length;
    if (byteLength < 8 || byteLength > 72) {
      next.password = "Use 8 to 72 characters.";
    } else if (
      !/[A-Z]/.test(form.password) ||
      !/[a-z]/.test(form.password) ||
      !/\d/.test(form.password)
    ) {
      next.password = "Include an uppercase letter, a lowercase letter, and a number.";
    }
    if (form.password !== form.confirmPassword) next.confirmPassword = "Passwords do not match.";
    if (!consent) next.consent = "Please accept the account terms to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    const email = form.email.trim().toLowerCase();
    try {
      await registerProfessor({
        full_name: form.full_name.trim(),
        employee_id: form.employee_id.trim(),
        email,
        password: form.password,
        department_id: form.department_id || null,
        title: form.title.trim() || null,
        office: form.office.trim() || null,
      });
      await login(email, form.password);
      toast.success("Professor account created.");
      router.replace("/professor");
    } catch (caught) {
      const message = errorMessage(caught);
      setServerError(message);
      if (caught instanceof ApiError) {
        const mapped: typeof errors = {};
        Object.entries(caught.fields).forEach(([key, value]) => {
          const field = key.split(".").pop() as keyof FormState;
          if (field in form) mapped[field] = value;
        });
        setErrors(mapped);
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Attendly</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/30 px-6 py-7 text-foreground sm:px-9">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserPlus className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Professor registration
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">Join the faculty</h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Create your professor account with your own details. You can start managing classes
              as soon as your account is created.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5 p-6 sm:p-9">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(event) => update("full_name", event.target.value)}
                  placeholder="Dr. Aisha Banday"
                  aria-invalid={Boolean(errors.full_name)}
                />
                {errors.full_name ? <p className="text-xs text-destructive">{errors.full_name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee_id">Employee ID</Label>
                <Input
                  id="employee_id"
                  value={form.employee_id}
                  onChange={(event) => update("employee_id", event.target.value)}
                  placeholder="EMP-001"
                  aria-invalid={Boolean(errors.employee_id)}
                />
                {errors.employee_id ? (
                  <p className="text-xs text-destructive">{errors.employee_id}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">University email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="you@university.edu"
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="department_id">Department</Label>
                <Select
                  value={form.department_id || "none"}
                  onValueChange={(value) => update("department_id", value === "none" ? "" : value)}
                >
                  <SelectTrigger id="department_id">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No department</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name} ({department.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="e.g. Assistant Professor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office">Office</Label>
                <Input
                  id="office"
                  value={form.office}
                  onChange={(event) => update("office", event.target.value)}
                  placeholder="e.g. Block A, Room 204"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(errors.password)}
                />
                {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => update("confirmPassword", event.target.value)}
                  placeholder="Repeat your password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                {errors.confirmPassword ? (
                  <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => {
                  setConsent(checked === true);
                  setErrors((current) => ({ ...current, consent: undefined }));
                }}
              />
              <div>
                <Label htmlFor="consent" className="cursor-pointer">
                  I confirm this information is accurate and agree to the campus attendance policy.
                </Label>
                {errors.consent ? <p className="mt-1 text-xs text-destructive">{errors.consent}</p> : null}
              </div>
            </div>

            {serverError ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Create professor account <ArrowRight />
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Briefcase className="size-3.5" />
              Use your university employee ID to create a faculty account.
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              Your credentials are never stored in browser storage.
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="size-3.5" />
              Registering a student?{" "}
              <Link href="/register" className="font-semibold hover:underline">
                Use the student form
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
