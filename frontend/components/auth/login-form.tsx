"use client";

import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
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

const demoHints = [
  { role: "Admin", email: "admin@university.edu", password: "Admin123!" },
  { role: "Professor", email: "professor@university.edu", password: "Professor123!" },
  { role: "Student", email: "student@university.edu", password: "Student123!" },
];

export function LoginForm() {
  const { login } = useAuth();
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
    <>
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
          <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Sign in <ArrowRight />
        </Button>
      </form>

      {process.env.NODE_ENV !== "production" ? (
        <div className="mt-8 rounded-md border border-border bg-muted/30 p-4">
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
    </>
  );
}
