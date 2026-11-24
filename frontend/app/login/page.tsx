"use client";

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  GraduationCap,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { homeForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: QrCode,
    title: "Tap to check in",
    description: "Short-lived, rotating QR tokens keep attendance fast and secure.",
  },
  {
    icon: Fingerprint,
    title: "Verified with liveness",
    description: "Face check-in pairs active challenges with privacy-first biometrics.",
  },
  {
    icon: ShieldCheck,
    title: "Role-aware control",
    description: "Admins, professors, and students get exactly the right tools.",
  },
];

const demoHints = [
  { role: "Admin", email: "admin@university.edu", password: "Admin123!" },
  { role: "Professor", email: "professor@university.edu", password: "Professor123!" },
  { role: "Student", email: "student@university.edu", password: "Student123!" },
];

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFieldErrors({ email: "Enter a valid email address." });
      return;
    }
    if (!password) {
      setFieldErrors({ password: "Password is required." });
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${user.full_name.split(" ")[0] || "there"}`);
      router.replace(homeForRole(user.role));
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      if (caught instanceof ApiError) setFieldErrors(caught.fields);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0d1024] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-indigo-600/30 blur-[110px]" />
          <div className="absolute bottom-0 right-0 size-[380px] rounded-full bg-sky-500/20 blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 shadow-glow">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">Attendly</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
              University attendance OS
            </p>
          </div>
        </div>

        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-indigo-200 backdrop-blur">
            <Sparkles className="size-3.5" /> Built for modern campuses
          </span>
          <h1 className="mt-7 text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">
            Attendance that
            <span className="block bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">
              just works.
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/65">
            One secure workspace for administrators, professors, and students — with
            live sessions, QR and face verification, and actionable analytics.
          </p>

          <div className="mt-10 space-y-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.07]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/50">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/40">
          <CheckCircle2 className="size-4 text-emerald-400" />
          Privacy-conscious · Role-based access · Audit ready
        </div>
      </section>

      <section className="relative flex items-center justify-center bg-background px-5 py-10 sm:px-10">
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/[0.07] to-transparent" />
        <div className="relative w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
              <GraduationCap className="size-5" />
            </div>
            <span className="text-lg font-bold">Attendly</span>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Welcome back
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Sign in to your portal</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your university credentials to continue.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">University email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="text-xs font-medium text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <span className="text-xs text-muted-foreground">Contact admin if forgotten</span>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="text-xs font-medium text-destructive">{fieldErrors.password}</p>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Sign in <ArrowRight />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New student?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>

          {process.env.NODE_ENV !== "production" ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-amber-500" />
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Development hints only
                </p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                These are example credentials for local development. They are not provisioned in production.
              </p>
              <div className="mt-3 space-y-1.5">
                {demoHints.map((hint) => (
                  <button
                    key={hint.role}
                    type="button"
                    onClick={() => {
                      setEmail(hint.email);
                      setPassword(hint.password);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                      "hover:bg-background",
                    )}
                  >
                    <span className="font-semibold">{hint.role}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{hint.email}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            {status === "loading" ? "Checking your session…" : "Protected by role-based access control"}
          </p>
        </div>
      </section>
    </div>
  );
}
