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
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { api, faceServiceErrorMessage } from "@/lib/api";
import { cameraErrorMessage, captureFrame, startCamera, stopCamera } from "@/lib/camera";
import { CONSENT_VERSION, FACE_CHALLENGES, FACE_FRAME_COUNT } from "@/lib/constants";
import { useResource } from "@/lib/hooks";
import { normalizeFaceStatus } from "@/lib/normalize";

interface CapturedFrame {
  data: string;
  challenge: string;
  label: string;
}

export default function FaceRegisterPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeIndex, setChallengeIndex] = useState(0);

  const loader = useCallback(
    () => api.get<unknown>("/face/status").then(normalizeFaceStatus),
    [],
  );
  const status = useResource(loader);
  const currentChallenge = FACE_CHALLENGES[Math.min(challengeIndex, FACE_CHALLENGES.length - 1)];

  const releaseCamera = useCallback(() => {
    stopCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  useEffect(() => () => {
    stopCamera(streamRef.current, videoRef.current);
  }, []);

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

  const reset = () => {
    setFrames([]);
    setChallengeIndex(0);
    setFormError(null);
  };

  const handleRegister = async () => {
    if (!consent) {
      setFormError("Please provide explicit consent before registering.");
      return;
    }
    if (frames.length < FACE_FRAME_COUNT) {
      setFormError(`Capture at least ${FACE_FRAME_COUNT} liveness frames.`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post("/face/register", {
        consent_version: CONSENT_VERSION,
        frames: frames.map((frame) => frame.data),
      });
      setFrames([]);
      setChallengeIndex(0);
      setConsent(false);
      releaseCamera();
      toast.success("Face registration complete");
      status.reload();
    } catch (error) {
      setFormError(faceServiceErrorMessage(error));
      toast.error(faceServiceErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete("/face/me");
      toast.success("Face data and consent removed");
      setDeleting(false);
      setConsent(false);
      reset();
      status.reload();
    } catch (error) {
      toast.error(faceServiceErrorMessage(error));
      setDeleting(false);
    }
  };

  const ready = frames.length >= FACE_FRAME_COUNT;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Biometrics"
        title="Register your face"
        description="Teach the system your face with active liveness checks. Raw images are processed in memory and never stored."
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="size-4 text-primary" /> Liveness capture
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
                        ? "Starting your camera…"
                        : "Start the camera to begin face registration.")}
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
              <Button variant="ghost" onClick={reset} disabled={frames.length === 0}>
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
              <CardTitle>Registration status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.loading ? (
                <p className="text-sm text-muted-foreground">Checking your face status…</p>
              ) : status.error ? (
                <p className="text-sm text-destructive">{faceServiceErrorMessage(status.error)}</p>
              ) : status.data?.registered ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-5" />
                    <span className="font-semibold">Face registered</span>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {status.data.consent_version ? (
                      <p>Consent version: {status.data.consent_version}</p>
                    ) : null}
                    {status.data.frames_count && Number.isFinite(status.data.frames_count) ? (
                      <p>Stored embeddings: {status.data.frames_count}</p>
                    ) : null}
                    {status.data.consented_at ? (
                      <p>Consented on: {new Date(status.data.consented_at).toLocaleDateString()}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => void start()}>
                      <RotateCcw /> Re-register
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 /> Delete my face data
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <CircleAlert className="size-5" />
                    <span className="font-semibold">Not registered yet</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Complete the capture and consent below to enable face check-in.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Consent
              </CardTitle>
              <CardDescription>Required version {CONSENT_VERSION}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
                <Checkbox
                  id="face-consent"
                  checked={consent}
                  onCheckedChange={(checked) => {
                    setConsent(checked === true);
                    setFormError(null);
                  }}
                />
                <div>
                  <Label htmlFor="face-consent" className="cursor-pointer">
                    I voluntarily consent to biometric face registration for attendance verification.
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    I understand that only encrypted embeddings are retained, that I may withdraw
                    consent at any time, and that withdrawal deletes my face data.
                  </p>
                </div>
              </div>

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
                disabled={!consent || !ready}
                onClick={() => void handleRegister()}
              >
                <Eye /> Submit face registration
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Raw frames are cleared from this page immediately after submission.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete face data?"
        description="This removes all stored embeddings and consent records. You can register again at any time."
        confirmLabel="Delete permanently"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
