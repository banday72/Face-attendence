"use client";

import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  MapPin,
  ScanFace,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { cameraErrorMessage, captureFrame, startCamera, stopCamera } from "@/lib/camera";
import { FACE_CHALLENGES, FACE_FRAME_COUNT } from "@/lib/constants";
import { useResource } from "@/lib/hooks";
import { getCurrentLocation, type LocationReading } from "@/lib/location";
import { isRecord, normalizeFaceStatus, normalizePaginated, normalizeSession, pick } from "@/lib/normalize";
import type { AttendanceStatus, Session } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface FaceResult {
  status: "success" | "error";
  message: string;
  attendanceStatus?: AttendanceStatus;
  score?: number;
}

export default function FaceAttendancePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationReading | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FaceResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sessionsLoader = useCallback(
    () =>
      api
        .get<unknown>("/sessions/active")
        .then((payload) => (Array.isArray(payload) ? payload.map(normalizeSession) : normalizePaginated(payload, normalizeSession).items)),
    [],
  );
  const sessions = useResource(sessionsLoader);
  const faceStatus = useResource(
    useCallback(() => api.get<unknown>("/face/status").then(normalizeFaceStatus), []),
  );

  useEffect(() => {
    const firstId = sessions.data?.[0]?.id;
    if (!selectedId && firstId) setSelectedId(firstId);
  }, [selectedId, sessions.data]);

  useEffect(() => {
    setLocation(null);
  }, [selectedId]);

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
    setResult(null);
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

  const selected = (sessions.data ?? []).find((item) => item.id === selectedId);
  const challengeKey = selected?.challenge;
  const challengeLabel = challengeKey
    ? FACE_CHALLENGES.find((item) => item.key === challengeKey)?.label ?? challengeKey
    : "No liveness challenge configured for this session";

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      setFrames((current) => [...current, captureFrame(video, 480, 0.78)]);
      setFormError(null);
    } catch (error) {
      setFormError(cameraErrorMessage(error));
    }
  };

  const requestLocation = useCallback(async (): Promise<LocationReading> => {
    try {
      const reading = await getCurrentLocation();
      setLocation(reading);
      return reading;
    } catch {
      const reading: LocationReading = {
        status: "unavailable",
        message: "Your location could not be determined in this browser.",
      };
      setLocation(reading);
      return reading;
    }
  }, []);

  const submit = async () => {
    if (!selected) {
      setFormError("Choose an active session first.");
      return;
    }
    if (!selected.challenge) {
      setFormError("This session has no liveness challenge. Ask your professor to configure one.");
      return;
    }
    if (frames.length < FACE_FRAME_COUNT) {
      setFormError(`Capture at least ${FACE_FRAME_COUNT} frames.`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setResult(null);
    try {
      let reading = location;
      if (selected.require_location) {
        reading = location ?? (await requestLocation());
        if (reading.latitude === undefined || reading.longitude === undefined) {
          throw new Error(
            reading.message ?? "Location is required for this session. Allow location access and try again.",
          );
        }
      }
      const body: Record<string, unknown> = {
        session_id: selectedId,
        frames,
        challenge: selected.challenge,
      };
      if (selected.require_location && reading) {
        body.latitude = reading.latitude;
        body.longitude = reading.longitude;
        body.accuracy = reading.accuracy ?? 0;
      }
      const response = await api.post<unknown>("/attendance/face", body);
      const envelope = isRecord(response) ? response : {};
      const rawStatus = pick(envelope, ["status"], "present").toLowerCase();
      setResult({
        status: "success",
        message: pick(envelope, ["message", "detail"], "Face verified and attendance recorded."),
        attendanceStatus: (["present", "late", "absent", "excused"].includes(rawStatus)
          ? rawStatus
          : "present") as AttendanceStatus,
        score: isRecord(envelope.verification)
          ? Number(envelope.verification.score)
          : Number(envelope.score) || undefined,
      });
      setFrames([]);
      setLocation(null);
      releaseCamera();
      toast.success("Face check-in successful");
    } catch (error) {
      const message = errorMessage(error);
      setResult({ status: "error", message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeSessions = sessions.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Check in"
        title="Face verification"
        description="Verify your presence with an active liveness challenge for an in-progress session."
      />

      {faceStatus.data && !faceStatus.data.registered ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold">Face registration required</p>
              <p className="text-sm text-muted-foreground">
                Register your face once before using biometric check-in.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/student/face-register">Register now</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanFace className="size-4 text-primary" /> Live capture
            </CardTitle>
            <CardDescription>
              Follow the prompt, capture {FACE_FRAME_COUNT} frames, then verify.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-slate-950">
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
                        : "Start the camera when you are ready.")}
                  </p>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/40" />
              )}
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Session challenge</p>
              <p className="mt-1 text-sm font-semibold">{challengeLabel}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {cameraState === "active" ? (
                <>
                  <Button onClick={capture}>
                    <Camera /> Capture ({frames.length}/{FACE_FRAME_COUNT})
                  </Button>
                  <Button variant="outline" onClick={releaseCamera}>
                    <CameraOff /> Stop
                  </Button>
                </>
              ) : (
                <Button onClick={() => void start()} loading={cameraState === "starting"}>
                  <Camera /> Start camera
                </Button>
              )}
              <Button
                loading={submitting}
                disabled={frames.length < FACE_FRAME_COUNT}
                onClick={() => void submit()}
              >
                <ScanFace /> Verify attendance
              </Button>
            </div>

            {formError ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {formError}
              </div>
            ) : null}

            {selected?.require_location ? (
              <div
                className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                  location?.status === "denied"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Location required for this session</p>
                  <p className="mt-0.5">
                    {location?.message ??
                      (location?.latitude !== undefined
                        ? `Location captured (±${Math.round(location.accuracy ?? 0)}m).`
                        : "You will be asked to share your location when you verify.")}
                  </p>
                </div>
              </div>
            ) : null}

            {result ? (
              <div
                className={`flex items-start gap-3 rounded-xl border p-4 ${
                  result.status === "success"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                {result.status === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="font-semibold">
                    {result.status === "success" ? "Verification successful" : "Verification failed"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
                  {result.attendanceStatus ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recorded as <span className="capitalize font-semibold">{result.attendanceStatus}</span>
                    </p>
                  ) : null}
                  {result.score ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Match score: {(result.score * 100).toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>Choose the session you are attending right now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.loading ? (
                <p className="text-sm text-muted-foreground">Loading active sessions…</p>
              ) : sessions.error ? (
                <p className="text-sm text-destructive">{errorMessage(sessions.error)}</p>
              ) : activeSessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium">No active sessions</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Face check-in opens when your professor starts a session.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-3" asChild>
                    <Link href="/student/schedule">View schedule</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <Select value={selectedId} onValueChange={(value) => setSelectedId(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a session" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSessions.map((session: Session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.class_name || "Class"} · {formatDateTime(session.start_time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selected ? (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                      <p className="flex justify-between">
                        <span>Classroom</span>
                        <span>{selected.classroom_name || "—"}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>Face check-in</span>
                        <span>{selected.require_face ? "Enabled" : "Not enabled"}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>Challenge</span>
                        <span>{challengeKey ?? "—"}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>Location</span>
                        <span>{selected.require_location ? "Required" : "Not required"}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>Started</span>
                        <span>{formatDateTime(selected.started_at || selected.start_time)}</span>
                      </p>
                      <Badge variant="success" className="mt-1">Session active</Badge>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Privacy first</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Frames are used only for this verification request and discarded after submission.</p>
              <p>Active challenges help confirm that a real person is present.</p>
              <p className="mt-3 rounded-xl bg-muted/40 p-3">
                Camera unavailable? Ask your professor to mark you manually or use{" "}
                <Link href="/student/scan" className="font-semibold text-primary hover:underline">
                  QR check-in
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
