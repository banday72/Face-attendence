export class CameraUnavailableError extends Error {}

export interface CameraOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

export function isSecureContextAvailable(): boolean {
  return typeof window === "undefined" || window.isSecureContext;
}

export function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export async function startCamera(
  video: HTMLVideoElement,
  options: CameraOptions = {},
): Promise<MediaStream> {
  if (!isSecureContextAvailable()) {
    throw new CameraUnavailableError(
      "Camera access requires HTTPS (or localhost). Open the app over a secure connection.",
    );
  }
  if (!isCameraSupported()) {
    throw new CameraUnavailableError(
      "This browser does not support camera access. Try Chrome, Edge, or Safari.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: options.facingMode ?? "environment",
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 720 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  stream?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

export function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 640,
  quality = 0.82,
): string {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new CameraUnavailableError("Camera preview is not ready yet.");
  }
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxWidth / sourceWidth);
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new CameraUnavailableError("Unable to process camera frame.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof CameraUnavailableError) return error.message;
  if (error instanceof DOMException) {
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name)) {
      return "Camera permission was denied. Enable it in your browser settings and retry.";
    }
    if (["NotFoundError", "DevicesNotFoundError"].includes(error.name)) {
      return "No camera was found on this device.";
    }
    if (["NotReadableError", "TrackStartError"].includes(error.name)) {
      return "Your camera is busy in another application. Close it and retry.";
    }
    if (error.name === "OverconstrainedError") {
      return "The requested camera configuration is not available on this device.";
    }
  }
  return error instanceof Error ? error.message : "Unable to start the camera.";
}
