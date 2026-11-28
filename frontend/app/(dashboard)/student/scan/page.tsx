"use client";

import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  MapPin,
  Radio,
  ScanLine,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { cameraErrorMessage, startCamera, stopCamera } from "@/lib/camera";
import { useActiveSessions } from "@/lib/hooks";
import { getCurrentLocation, type LocationReading } from "@/lib/location";
import { isRecord, pick } from "@/lib/normalize";
import { cleanQrPayload, startQrScanner } from "@/lib/qr";
import type { AttendanceStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface CheckInResult {
  status: AttendanceStatus;
  message: string;
  className?: string;
  locationStatus?: string;
}

export default function StudentScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopScannerRef = useRef<(() => void) | null>(null);
  const submitRef = useRef<(payload: string) => Promise<void>>(async () => undefined);

  const [cameraState, setCameraState] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationReading | null>(null);
  const [includeLocation, setIncludeLocation] = useState(true);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const activeSessions = useActiveSessions();

  const captureLocation = useCallback(async (): Promise<LocationReading> => {
    try {
      const reading = await getCurrentLocation();
      setLocation(reading);
      return reading;
    } catch {
      const reading: LocationReading = {
        status: "unavailable",
        message: "Geolocation is unavailable in this browser.",
      };
      setLocation(reading);
      return reading;
    }
  }, []);

  const submitCheckIn = useCallback(
    async (payload: string) => {
      const clean = cleanQrPayload(payload);
      if (!clean) {
        setFormError("Scan or paste a QR token first.");
        return;
      }
      setSubmitting(true);
      setFormError(null);
      setResult(null);
      try {
        let reading = location;
        if (
          includeLocation &&
          (!reading || reading.latitude === undefined || reading.longitude === undefined)
        ) {
          reading = await captureLocation();
        }
        const body: Record<string, unknown> = { token: clean };
        if (
          includeLocation &&
          reading &&
          reading.latitude !== undefined &&
          reading.longitude !== undefined
        ) {
          body.latitude = reading.latitude;
          body.longitude = reading.longitude;
          body.accuracy = reading.accuracy ?? 0;
        }
        const response = await api.post<unknown>("/attendance/qr", body);
        const envelope = isRecord(response) ? response : {};
        const status = pick(envelope, ["status"], "present").toLowerCase() as AttendanceStatus;
        setResult({
          status: ["present", "late", "absent", "excused"].includes(status) ? status : "present",
          message:
            pick(envelope, ["message", "detail"], "Check-in recorded successfully.") ||
            "Check-in recorded successfully.",
          className: pick(envelope, ["class_name"]) || pick(isRecord(envelope.attendance) ? envelope.attendance : {}, ["class_name"]),
          locationStatus: pick(envelope, ["location_status"]),
        });
        setToken("");
        toast.success("Attendance check-in recorded");
      } catch (error) {
        setFormError(errorMessage(error));
        toast.error(errorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [captureLocation, includeLocation, location],
  );

  useEffect(() => {
    submitRef.current = submitCheckIn;
  }, [submitCheckIn]);

  const stopScanning = useCallback(() => {
    stopScannerRef.current?.();
    stopScannerRef.current = null;
    stopCamera(streamRef.current, videoRef.current);
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  useEffect(() => () => {
    stopScannerRef.current?.();
    stopCamera(streamRef.current, videoRef.current);
  }, []);

  const startScanning = async () => {
    setCameraError(null);
    setCameraState("starting");
    setResult(null);
    try {
      if (!videoRef.current || !canvasRef.current) return;
      streamRef.current = await startCamera(videoRef.current, { facingMode: "environment" });
      setCameraState("active");
      stopScannerRef.current = startQrScanner(
        videoRef.current,
        canvasRef.current,
        (payload) => {
          stopScannerRef.current?.();
          stopScannerRef.current = null;
          setToken(payload);
          void submitRef.current(payload);
        },
      );
      if (includeLocation && !location) {
        await captureLocation();
      }
    } catch (error) {
      const message = cameraErrorMessage(error);
      setCameraError(message);
      setCameraState("error");
      toast.error(message);
    }
  };

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCheckIn(token);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Check in"
        title="Scan attendance QR"
        description="Point your camera at the QR code shown in class. Location is captured only when you allow it."
      />

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-4 text-primary" /> Active sessions
            </CardTitle>
            <CardDescription>
              Sessions currently open for check-in. Scan the QR displayed in class.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/student/face-attendance">Face check-in</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeSessions.loading ? (
            <p className="text-sm text-muted-foreground">Loading active sessions…</p>
          ) : activeSessions.error ? (
            <p className="text-sm text-destructive">{errorMessage(activeSessions.error)}</p>
          ) : activeSessions.data && activeSessions.data.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {activeSessions.data.map((session) => (
                <div
                  key={session.id}
                  className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                >
                  <p className="font-medium">
                    {session.course_name || session.class_name || "Class"}
                    {session.section ? ` · ${session.section}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {session.classroom_name || "Classroom not set"}
                    {session.started_at || session.start_time
                      ? ` · Started ${formatDateTime(session.started_at || session.start_time || "")}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active sessions right now. Wait for your professor to start one.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4 text-primary" /> Camera scanner
            </CardTitle>
            <CardDescription>Scanning stops automatically after a code is detected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-slate-950">
              <video ref={videoRef} className="size-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {cameraState !== "active" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
                  {cameraState === "error" ? (
                    <CameraOff className="size-9 text-rose-400" />
                  ) : (
                    <Camera className="size-9 text-white/40" />
                  )}
                  <p className="max-w-xs text-sm">
                    {cameraError ??
                      (cameraState === "starting"
                        ? "Starting your camera…"
                        : "Your camera preview will appear here.")}
                  </p>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-x-8 inset-y-12 rounded-lg border-2 border-white/60 shadow-[0_0_0_9999px_rgba(2,6,23,.28)]">
                  <span className="absolute -left-0.5 -top-0.5 size-6 rounded-tl-md border-l-4 border-t-4 border-primary" />
                  <span className="absolute -right-0.5 -top-0.5 size-6 rounded-tr-md border-r-4 border-t-4 border-primary" />
                  <span className="absolute -bottom-0.5 -left-0.5 size-6 rounded-bl-md border-b-4 border-l-4 border-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-br-md border-b-4 border-r-4 border-primary" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {cameraState === "active" ? (
                <Button variant="outline" onClick={stopScanning}>
                  <CameraOff /> Stop camera
                </Button>
              ) : (
                <Button onClick={() => void startScanning()} loading={cameraState === "starting"}>
                  <Camera /> Start camera
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void captureLocation()}
              >
                <MapPin /> Capture location
              </Button>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">Location signal</span>
                <Badge
                  variant={
                    location?.status === "verified"
                      ? "success"
                      : location?.status === "denied"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {location?.status ?? "not captured"}
                </Badge>
              </div>
              {location?.latitude !== undefined ? (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {location.latitude.toFixed(5)}, {location.longitude?.toFixed(5)} · ±
                  {Math.round(location.accuracy ?? 0)}m
                </p>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  {location?.message ?? "Allow location if your session requires it."}
                </p>
              )}
              {location && location.status !== "verified" ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Location could not be captured. Check-in will continue without it; if your
                    session requires location, ask your professor for the manual option.
                  </span>
                </div>
              ) : null}
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(event) => setIncludeLocation(event.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Include location with check-in
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" /> Manual token
              </CardTitle>
              <CardDescription>
                If the camera is unavailable, paste the token displayed by your professor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="qr-token">QR token</Label>
                  <Input
                    id="qr-token"
                    value={token}
                    onChange={(event) => {
                      setToken(event.target.value);
                      setFormError(null);
                    }}
                    placeholder="uat:v1:…"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" className="w-full" loading={submitting}>
                  <ScanLine /> Check in with token
                </Button>
              </form>
              {formError ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" /> {formError}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {result ? (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="flex items-start gap-3 p-5">
                {result.status === "present" || result.status === "late" ? (
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 size-6 shrink-0 text-rose-500" />
                )}
                <div>
                  <p className="font-semibold capitalize">{result.status} · Check-in recorded</p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
                  {result.className ? (
                    <p className="mt-1 text-xs text-muted-foreground">{result.className}</p>
                  ) : null}
                  {result.locationStatus ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Location: {result.locationStatus.replaceAll("_", " ")}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <span className="font-bold text-primary">1.</span> Your professor starts a session and displays a rotating QR code.
              </p>
              <p className="flex gap-2">
                <span className="font-bold text-primary">2.</span> Scan it in class; tokens expire and cannot be reused.
              </p>
              <p className="flex gap-2">
                <span className="font-bold text-primary">3.</span> If required, your location is checked against the classroom radius.
              </p>
              <p className="mt-3 flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                Camera access requires HTTPS (localhost is allowed). You can always use the manual token instead.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
