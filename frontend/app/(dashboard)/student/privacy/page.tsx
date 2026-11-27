"use client";

import { Download, RefreshCw, ScanFace, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { normalizeConsent, normalizeFaceDataExport } from "@/lib/normalize";
import { formatDateTime } from "@/lib/utils";

export default function StudentPrivacyPage() {
  const [accepting, setAccepting] = useState(false);

  const consentLoader = useCallback(
    () => api.get<unknown>("/me/consent").then(normalizeConsent),
    [],
  );
  const consent = useResource(consentLoader);

  const exportLoader = useCallback(
    () => api.get<unknown>("/face/me/export").then(normalizeFaceDataExport),
    [],
  );
  const faceData = useResource(exportLoader);

  const acceptConsent = async () => {
    setAccepting(true);
    try {
      const result = await api.post<unknown>("/me/consent");
      consent.setData(normalizeConsent(result));
      toast.success("Biometric consent recorded");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAccepting(false);
    }
  };

  const downloadExport = () => {
    const data = faceData.data;
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `face-data-${data.student_id || "export"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Face data export downloaded");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Privacy & face data"
        description="Manage biometric consent, export stored face data, and control your registration."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              consent.reload();
              faceData.reload();
            }}
          >
            <RefreshCw /> Refresh
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Biometric consent
            </CardTitle>
            <CardDescription>Consent is required before face check-in can be used.</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              loading={consent.loading}
              error={consent.error}
              data={consent.data}
              onRetry={consent.reload}
              skeleton={<div className="h-56 animate-pulse rounded-lg bg-muted/60" />}
              emptyTitle="No consent record"
              emptyDescription="Accept the current consent version to enable face features."
            >
              {(data) => (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={data.is_active && !data.requires_new_consent ? "success" : "warning"}>
                      {data.is_active && !data.requires_new_consent
                        ? "Consent active"
                        : "Consent required"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Current version: {data.current_version || "—"}
                    </span>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Accepted version
                      </dt>
                      <dd className="mt-1 font-medium">{data.consent_version || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Accepted on
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatDateTime(data.consented_at ?? undefined)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Revoked on
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatDateTime(data.revoked_at ?? undefined)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Student ID
                      </dt>
                      <dd className="mt-1 font-mono text-xs">{data.student_id || "—"}</dd>
                    </div>
                  </dl>
                  <Button className="w-full" loading={accepting} onClick={() => void acceptConsent()}>
                    <ShieldCheck /> Accept / refresh consent
                  </Button>
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanFace className="size-4 text-primary" /> Stored face data
            </CardTitle>
            <CardDescription>A safe summary of the embeddings associated with your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              loading={faceData.loading}
              error={faceData.error}
              data={faceData.data}
              onRetry={faceData.reload}
              skeleton={<div className="h-56 animate-pulse rounded-lg bg-muted/60" />}
              emptyTitle="No face data"
              emptyDescription="Register your face to enable biometric attendance check-in."
            >
              {(data) => (
                <div className="space-y-5">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Embeddings
                      </dt>
                      <dd className="mt-1 text-2xl font-bold">{data.embedding_count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Exported on
                      </dt>
                      <dd className="mt-1 font-medium">{formatDateTime(data.exported_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Model
                      </dt>
                      <dd className="mt-1 font-medium">{data.model_name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Vector version
                      </dt>
                      <dd className="mt-1 font-medium">{data.vector_version || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Consent version
                      </dt>
                      <dd className="mt-1 font-medium">
                        {(data.consent ?? data.consent_metadata)?.consent_version || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        University ID
                      </dt>
                      <dd className="mt-1 font-medium">{data.university_id || "—"}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={downloadExport}>
                      <Download /> Download JSON
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/student/face-register">
                        <ScanFace /> Manage or delete face data
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registration and deletion</CardTitle>
          <CardDescription>
            Register new face samples or permanently delete stored embeddings from the face registration page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/student/face-register">
              <ScanFace /> Open face registration
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
