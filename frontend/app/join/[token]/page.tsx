"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GraduationCap,
  LockKeyhole,
  ScanFace,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { InviteDetails } from "@/lib/types";

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { acceptAuth } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("This invite link is incomplete.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void api
      .get<InviteDetails>(`/auth/invites/${encodeURIComponent(token)}`, {
        skipAuth: true,
        signal: controller.signal,
      })
      .then((details) => {
        if (!controller.signal.aborted) setInvite(details);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  const validate = () => {
    const next: Record<string, string> = {};
    const byteLength = new TextEncoder().encode(password).length;
    if (byteLength < 8 || byteLength > 72) {
      next.password = "Use 8 to 72 characters.";
    } else if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      next.password = "Include an uppercase letter, a lowercase letter, and a number.";
    }
    if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    if (!consent) next.consent = "Please accept the account terms to continue.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    if (!validate() || !token) return;

    setSubmitting(true);
    try {
      const payload = await api.post<unknown>(
        "/auth/register-with-invite",
        { token, password },
        { skipAuth: true },
      );
      acceptAuth(payload);
      toast.success("Account created. Complete your face registration next.");
      router.replace("/student/face-register");
    } catch (caught) {
      const message = errorMessage(caught);
      setServerError(message);
      setLoadError(message);
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
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Invitation
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Complete your student account
                </h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Your coordinator invited you to Attendly. Confirm your details, choose a
              password, then register your face for attendance check-in.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
              <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Checking your invite…
            </div>
          ) : loadError || !invite ? (
            <div className="space-y-4 p-6 sm:p-9">
              <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {loadError ?? "This invite link is no longer available."}
              </div>
              <p className="text-sm text-muted-foreground">
                Ask your coordinator for a new invite link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5 p-6 sm:p-9">
              <div className="rounded-md border border-border bg-muted/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Invited as
                </p>
                <p className="mt-1 font-semibold">{invite.full_name}</p>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>{invite.email}</p>
                  <p>University ID: {invite.university_id}</p>
                  {invite.department_name ? <p>{invite.department_name}</p> : null}
                  {invite.program ? <p>{invite.program}</p> : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <LockKeyhole className="size-4 text-primary" /> Choose a password
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setErrors((current) => ({ ...current, password: undefined }));
                      }}
                      aria-invalid={Boolean(errors.password)}
                    />
                    {errors.password ? (
                      <p className="text-xs text-destructive">{errors.password}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        8-72 characters with upper, lower, and numeric characters.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setErrors((current) => ({ ...current, confirmPassword: undefined }));
                      }}
                      aria-invalid={Boolean(errors.confirmPassword)}
                    />
                    {errors.confirmPassword ? (
                      <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-4">
                <Checkbox
                  id="terms"
                  checked={consent}
                  onCheckedChange={(checked) => {
                    setConsent(checked === true);
                    setErrors((current) => ({ ...current, consent: undefined }));
                  }}
                />
                <div>
                  <Label htmlFor="terms" className="cursor-pointer">
                    I confirm these details are mine and agree to the account terms.
                  </Label>
                  {errors.consent ? (
                    <p className="mt-1 text-xs text-destructive">{errors.consent}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <ScanFace className="mt-0.5 size-4 shrink-0 text-primary" />
                Next step: register your face with a short liveness check. Camera frames
                stay in this browser; only encrypted embeddings are stored.
              </div>

              {serverError ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" /> {serverError}
                </div>
              ) : null}

              <Button type="submit" className="w-full" loading={submitting}>
                Create account and continue <ArrowRight />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
