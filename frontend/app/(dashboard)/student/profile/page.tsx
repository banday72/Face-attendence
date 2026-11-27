"use client";

import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useResource } from "@/lib/hooks";
import { normalizeProfile, normalizeUser } from "@/lib/normalize";
import type { Profile } from "@/lib/types";
import { formatDate, roleLabel } from "@/lib/utils";

interface ProfileForm {
  full_name: string;
  phone: string;
  program: string;
  year_level: string;
}

interface ProfileUpdatePayload {
  full_name: string;
  phone?: string;
  program?: string;
  year_level?: number;
}

const emptyForm: ProfileForm = {
  full_name: "",
  phone: "",
  program: "",
  year_level: "",
};

export default function StudentProfilePage() {
  const { updateUser } = useAuth();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loader = useCallback(
    () => api.get<unknown>("/me/profile").then(normalizeProfile),
    [],
  );
  const resource = useResource(loader);
  const profile = resource.data;

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      phone: profile.phone ?? "",
      program: profile.program ?? "",
      year_level:
        profile.year_level === null || profile.year_level === undefined
          ? ""
          : String(profile.year_level),
    });
  }, [profile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = form.full_name.trim();
    const phone = form.phone.trim();
    const program = form.program.trim();
    const yearLevel = form.year_level.trim();
    const nextErrors: Record<string, string> = {};

    if (fullName.length < 2) nextErrors.full_name = "Enter at least 2 characters.";
    else if (fullName.length > 150) nextErrors.full_name = "Use 150 characters or fewer.";
    if (phone.length > 30) nextErrors.phone = "Use 30 characters or fewer.";
    if (program.length > 120) nextErrors.program = "Use 120 characters or fewer.";
    if (
      yearLevel &&
      (!/^\d+$/.test(yearLevel) || Number(yearLevel) < 1 || Number(yearLevel) > 8)
    ) {
      nextErrors.year_level = "Choose a year level from 1 to 8.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: ProfileUpdatePayload = { full_name: fullName };
    if (phone) payload.phone = phone;
    if (program) payload.program = program;
    if (yearLevel) payload.year_level = Number(yearLevel);

    setSaving(true);
    setFormError(null);
    try {
      const result = await api.patch<unknown>("/me/profile", payload);
      updateUser(normalizeUser(result));
      toast.success("Profile updated");
      resource.reload();
    } catch (error) {
      const message = errorMessage(error);
      setFormError(message);
      toast.error(message);
      if (error instanceof ApiError) setFieldErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="My profile"
        description="Keep your contact details and program information up to date."
        actions={
          <Button variant="outline" onClick={resource.reload}>
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <QueryState
        loading={resource.loading}
        error={resource.error}
        data={resource.data}
        onRetry={resource.reload}
        skeleton={<div className="h-96 animate-pulse rounded-lg bg-muted/60" />}
        emptyTitle="Profile unavailable"
        emptyDescription="Your profile could not be loaded. Try refreshing the page."
      >
        {(data: Profile) => (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Editable details</CardTitle>
                <CardDescription>
                  Leave an optional field blank to keep its current value.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Full name"
                      htmlFor="profile-name"
                      required
                      error={fieldErrors.full_name}
                    >
                      <Input
                        id="profile-name"
                        value={form.full_name}
                        maxLength={150}
                        aria-invalid={Boolean(fieldErrors.full_name)}
                        onChange={(event) => {
                          setForm((current) => ({ ...current, full_name: event.target.value }));
                          setFieldErrors((current) => ({ ...current, full_name: "" }));
                        }}
                      />
                    </FormField>
                    <FormField
                      label="Email"
                      htmlFor="profile-email"
                      hint="Managed by your administrator."
                    >
                      <Input id="profile-email" value={data.email ?? ""} disabled />
                    </FormField>
                    <FormField
                      label="Phone"
                      htmlFor="profile-phone"
                      error={fieldErrors.phone}
                    >
                      <Input
                        id="profile-phone"
                        value={form.phone}
                        maxLength={30}
                        placeholder="Not provided"
                        aria-invalid={Boolean(fieldErrors.phone)}
                        onChange={(event) => {
                          setForm((current) => ({ ...current, phone: event.target.value }));
                          setFieldErrors((current) => ({ ...current, phone: "" }));
                        }}
                      />
                    </FormField>
                    <FormField
                      label="University ID"
                      htmlFor="profile-university-id"
                      hint="Managed by your administrator."
                    >
                      <Input id="profile-university-id" value={data.university_id ?? ""} disabled />
                    </FormField>
                    <FormField
                      label="Program"
                      htmlFor="profile-program"
                      error={fieldErrors.program}
                    >
                      <Input
                        id="profile-program"
                        value={form.program}
                        maxLength={120}
                        placeholder="Not provided"
                        aria-invalid={Boolean(fieldErrors.program)}
                        onChange={(event) => {
                          setForm((current) => ({ ...current, program: event.target.value }));
                          setFieldErrors((current) => ({ ...current, program: "" }));
                        }}
                      />
                    </FormField>
                    <FormField
                      label="Year level"
                      htmlFor="profile-year"
                      error={fieldErrors.year_level}
                      hint="A number from 1 to 8."
                    >
                      <Input
                        id="profile-year"
                        type="number"
                        min={1}
                        max={8}
                        value={form.year_level}
                        placeholder="Not provided"
                        aria-invalid={Boolean(fieldErrors.year_level)}
                        onChange={(event) => {
                          setForm((current) => ({ ...current, year_level: event.target.value }));
                          setFieldErrors((current) => ({ ...current, year_level: "" }));
                        }}
                      />
                    </FormField>
                  </div>
                  {formError ? (
                    <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                      {formError}
                    </p>
                  ) : null}
                  <div className="flex justify-end border-t border-border pt-4">
                    <Button type="submit" loading={saving}>
                      <Save /> Save changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Role</span>
                    <Badge variant="outline">{roleLabel(data.role)}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">{data.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Department</span>
                    <span className="max-w-[170px] truncate text-right font-medium">
                      {data.department_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Member since</span>
                    <span className="font-medium">{formatDate(data.created_at)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" /> Privacy
                  </CardTitle>
                  <CardDescription>
                    Review biometric consent, download your face data, or manage registration.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/student/privacy">Open privacy settings</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
