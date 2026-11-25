import {
  CheckCircle2,
  Fingerprint,
  GraduationCap,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

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

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden bg-navy p-10 text-cream lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-coral text-navy">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Attendly</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cream/55">
              University attendance system
            </p>
          </div>
        </div>

        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            Smart campus operations
          </p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Attendance you can rely on.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-cream/70">
            One secure workspace for administrators, professors, and students, with
            QR and face verification, live sessions, and clear reporting.
          </p>

          <div className="mt-10 space-y-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-4 rounded-md border border-cream/15 bg-cream/[0.04] p-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-coral/15 text-coral">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-cream/55">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-cream/50">
          <CheckCircle2 className="size-4 text-coral" />
          Privacy-conscious · Role-based access · Audit ready
        </div>
      </section>

      <section className="flex items-center justify-center bg-background px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </div>
            <span className="text-lg font-semibold">Attendly</span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Welcome back
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to your portal</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your university credentials to continue.
          </p>

          <LoginForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New student?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            Protected by role-based access control
          </p>
        </div>
      </section>
    </div>
  );
}
