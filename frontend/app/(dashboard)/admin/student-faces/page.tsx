"use client";

import {
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  CircleAlert,
  Eye,
  RotateCcw,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api, errorMessage, faceServiceErrorMessage } from "@/lib/api";
import { cameraErrorMessage, captureFrame, startCamera, stopCamera } from "@/lib/camera";
import { CONSENT_VERSION, FACE_CHALLENGES, FACE_FRAME_COUNT } from "@/lib/constants";
import { useDebouncedValue, useResource } from "@/lib/hooks";
import { normalizeFaceStatus, normalizePaginated, normalizeStudentOption } from "@/lib/normalize";
import type { FaceStatus, StudentOption } from "@/lib/types";

interface CapturedFrame {
  data: string;
  challenge: string;
  label: string;
}

export default function AdminStudentFacesPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedStudentSearch = useDebouncedValue(studentSearch);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [consentReference, setConsentReference] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<FaceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<Error | null>(null);

  const studentsLoader = useCallback(
    () =>
      api
        .get<unknown>("/admin/students", { query: { page_size: 100 } })
        .then((payload) => normalizePaginated(payload, normalizeStudentOption).items),
    [],
  );
  const students = useResource(studentsLoader);
  const currentChallenge = FACE_CHALLENGES[Math.min(challengeIndex, FACE_CHALLENGES.length - 1)];
  const selectedStudent = (students.data ?? []).find((item) => item.id === selectedStudentId);

  const loadStatus = useCallback(async (studentId: string) => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const payload = await api.get<unknown>(`/admin/face/status/${encodeURIComponent(studentId)}`);
      setStatus(normalizeFaceStatus(payload));
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error : new Error("Unexpected error"));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const resetCapture = useCallback(() => {
    setFrames([]);
    setChallengeIndex(0);
    setConsent(false);
    setConsentReference("");
    setFormError(null);
  }, []);

  const releaseCamera = useCallback(() => {
    stopCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  useEffect(() => () => {
    stopCamera(streamRef.current, videoRef.current);
  }, []);

  useEffect(() => {
    resetCapture();
    if (!selectedStudentId) {
      setStatus(null);
      setStatusError(null);
      setStatusLoading(false);
      return;
    }
    void loadStatus(selectedStudentId);
  }, [selectedStudentId, loadStatus, resetCapture]);

  const start = async () => {
    setCameraError(null);
    setCameraState("starting");
    try {
      if (!videoRef.current) return;
      streamRef.current = await startCamera(videoRef.current, { facingMode: "user" });
      setCameraState("active");
    } catch (error) {
      const message = cameraErrorMessage(error);
      setCameraError(message);
      setCameraState("error");
      toast.error(message);
    }
  };

  const capture = () => {
    if (!videoRef.current) return;
    try {
      const data = captureFrame(videoRef.current, 480, 0.78);
      setFrames((current) => [
        ...current,
        { data, challenge: currentChallenge.key, label: currentChallenge.label },
      ]);
      setChallengeIndex((current) => (current + 1) % FACE_CHALLENGES.length);
      setFormError(null);
    } catch (error) {
      setFormError(cameraErrorMessage(error));
    }
  };

  const handleRegister = async () => {
    if (!selectedStudentId) {
      setFormError("Choose a student first.");
      return;
    }
    if (!consent) {
      setFormError("Confirm that the student's consent was recorded.");
      return;
    }
    if (!consentReference.trim()) {
      setFormError("Enter a consent reference for the audit trail.");
      return;
    }
    if (frames.length < FACE_FRAME_COUNT) {
      setFormError(`Capture at least ${FACE_FRAME_COUNT} liveness frames.`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post(`/admin/face/register/${encodeURIComponent(selectedStudentId)}`, {
        consent_version: CONSENT_VERSION,
        frames: frames.map((frame) => frame.data),
        consent_confirmed: true,
        consent_reference: consentReference.trim(),
      });
      toast.success("Student face registered");
      resetCapture();
      releaseCamera();
      await loadStatus(selectedStudentId);
    } catch (error) {
      const message = faceServiceErrorMessage(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const studentOptions = (students.data ?? []).filter((item: StudentOption) => {
    const needle = debouncedStudentSearch.trim().toLowerCase();
    if (!needle) return true;
    return [item.full_name, item.email, item.university_id]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(needle));
  });
  const ready = frames.length >= FACE_FRAME_COUNT;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Student face enrollment"
        description="Record biometric consent and register a student's face on their behalf using supervised liveness capture."
      />

      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
          <FormField label="Student" htmlFor="face-student" required>
            <Select
              value={selectedStudentId || "none"}
              onValueChange={(value) => setSelectedStudentId(value === "none" ? "" : value)}
              disabled={students.loading}
            >
              <SelectTrigger id="face-student">
                <SelectValue placeholder={students.loading ? "Loading students…" : "Select student"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select student</SelectItem>
                {studentOptions.map((item: StudentOption) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.full_name} {item.university_id ? `· ${item.university_id}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Find student" htmlFor="face-student-search">
            <Input
              id="face-student-search"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Name, email, or university ID"
            />
          </FormField>
          {students.error ? (
            <p className="text-sm text-destructive lg:col-span-2">{errorMessage(students.error)}</p>
          ) : null}
        </CardContent>
      </Card>

      {!selectedStudentId ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
            <ScanFace className="size-5 text-primary" />
            Select a student to view their face status and start enrollment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="size-4 text-primary" /> Supervised liveness capture
              </CardTitle>
              <CardDescription>
                Follow each prompt and capture {FACE_FRAME_COUNT} frames from different angles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-slate-950">
                <video ref={videoRef} className="size-full object-cover" playsInline muted />
                {cameraState !== "active" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
                    {cameraState === "error" ? (
                      <CameraOff className="size-9 text-rose-400" />
                    ) : (
                      <ScanFace className="size-9 text-white/40" />
                    )}
                    <p className="max-w-xs text-sm">
                      {cameraError ??
                        (cameraState === "starting"
                          ? "Starting the camera…"
                          : "Start the camera to begin enrollment.")}
                    </p>
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/40" />
                )}
              </div>

              <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Current challenge</p>
                    <p className="mt-1 text-sm font-semibold">{currentChallenge.label}</p>
                  </div>
                  <Badge variant="outline">
                    {frames.length} / {FACE_FRAME_COUNT}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {cameraState === "active" ? (
                  <Button onClick={capture}>
                    <Camera /> Capture frame
                  </Button>
                ) : (
                  <Button onClick={() => void start()} loading={cameraState === "starting"}>
                    <Camera /> Start camera
                  </Button>
                )}
                {cameraState === "active" ? (
                  <Button variant="outline" onClick={releaseCamera}>
                    <CameraOff /> Stop camera
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setFrames([])} disabled={frames.length === 0}>
                  <RotateCcw /> Clear frames
                </Button>
              </div>

              {frames.length ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {frames.map((frame, index) => (
                    <div key={`${frame.challenge}-${index}`} className="relative shrink-0">
                      <img
                        src={frame.data}
                        alt={`Frame ${index + 1}`}
                        className="size-20 rounded-md border border-border object-cover"
                      />
                      <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="size-3" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Student status</CardTitle>
                <CardDescription>
                  {selectedStudent?.full_name ?? "Selected student"}
                  {selectedStudent?.email ? ` · ${selectedStudent.email}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {statusLoading ? (
                  <p className="text-sm text-muted-foreground">Checking face status…</p>
                ) : statusError ? (
                  <p className="text-sm text-destructive">{faceServiceErrorMessage(statusError)}</p>
                ) : status?.registered ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-5" />
                      <span className="font-semibold">Face registered</span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {status.consent_version ? <p>Consent version: {status.consent_version}</p> : null}
                      {status.frames_count && Number.isFinite(status.frames_count) ? (
                        <p>Stored embeddings: {status.frames_count}</p>
                      ) : null}
                      {status.consented_at ? (
                        <p>Consented on: {new Date(status.consented_at).toLocaleDateString()}</p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <CircleAlert className="size-5" />
                      <span className="font-semibold">Not registered yet</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Complete the capture and consent below to enable face check-in for this student.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" /> Recorded consent
                </CardTitle>
                <CardDescription>Required version {CONSENT_VERSION}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
                  <Checkbox
                    id="admin-face-consent"
                    checked={consent}
                    onCheckedChange={(checked) => {
                      setConsent(checked === true);
                      setFormError(null);
                    }}
                  />
                  <div>
                    <Label htmlFor="admin-face-consent" className="cursor-pointer">
                      I confirm this student voluntarily consented to biometric face registration.
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This confirmation and reference are written to the audit log. Only encrypted embeddings
                      are retained.
                    </p>
                  </div>
                </div>
                <FormField
                  label="Consent reference"
                  htmlFor="consent-reference"
                  required
                  hint="Form, ticket, or signed consent document reference"
                >
                  <Input
                    id="consent-reference"
                    value={consentReference}
                    onChange={(event) => setConsentReference(event.target.value)}
                    placeholder="e.g. CONSENT-2026-0142"
                  />
                </FormField>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Capture progress</span>
                    <span className="font-semibold">
                      {Math.min(frames.length, FACE_FRAME_COUNT)} / {FACE_FRAME_COUNT}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (frames.length / FACE_FRAME_COUNT) * 100)}%` }}
                    />
                  </div>
                </div>
                {formError ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {formError}
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  loading={submitting}
                  disabled={!consent || !consentReference.trim() || !ready}
                  onClick={() => void handleRegister()}
                >
                  <Eye /> Register student face
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
