"use client";

import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface FormState {
  full_name: string;
  university_id: string;
  email: string;
  password: string;
  confirmPassword: string;
  department_id: string;
}

const initialState: FormState = {
  full_name: "",
  university_id: "",
  email: "",
  password: "",
  confirmPassword: "",
  department_id: "",
};

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | "consent", string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<keyof FormState | "consent", string>> = {};
    if (form.full_name.trim().length < 3) next.full_name = "Enter your full name.";
    if (!form.university_id.trim()) next.university_id = "University ID is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.password.length < 8) next.password = "Use at least 8 characters.";
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
    try {
      await register({
        full_name: form.full_name.trim(),
        university_id: form.university_id.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        department_id: form.department_id.trim() || undefined,
      });
      toast.success("Account created. Sign in to continue.");
      router.replace("/login");
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
                  Student registration
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">Join your campus</h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Create your student account to access classes, check-ins, and attendance history.
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
                  placeholder="Aisha Banday"
                  aria-invalid={Boolean(errors.full_name)}
                />
                {errors.full_name ? <p className="text-xs text-destructive">{errors.full_name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="university_id">University ID</Label>
                <Input
                  id="university_id"
                  value={form.university_id}
                  onChange={(event) => update("university_id", event.target.value)}
                  placeholder="2024-CS-001"
                  aria-invalid={Boolean(errors.university_id)}
                />
                {errors.university_id ? (
                  <p className="text-xs text-destructive">{errors.university_id}</p>
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
                <Label htmlFor="department_id">Department ID <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="department_id"
                  value={form.department_id}
                  onChange={(event) => update("department_id", event.target.value)}
                  placeholder="Ask your coordinator"
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Biometric features, if used later, require a separate explicit consent.
                </p>
                {errors.consent ? <p className="mt-1 text-xs text-destructive">{errors.consent}</p> : null}
              </div>
            </div>

            {serverError ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Create student account <ArrowRight />
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              Your credentials are never stored in browser storage.
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="size-3.5" />
              Already registered?{" "}
              <Link href="/login" className="font-semibold hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
