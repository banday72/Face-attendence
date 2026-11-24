import jsQR from "jsqr";

import { QR_TOKEN_PREFIX } from "@/lib/constants";

export function decodeQr(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });
  return result?.data?.trim() ?? null;
}

export function startQrScanner(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onDetected: (payload: string) => void,
): () => void {
  let active = true;
  let frame = 0;
  const tick = () => {
    if (!active) return;
    const payload = decodeQr(video, canvas);
    if (payload) {
      onDetected(payload);
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    active = false;
    window.cancelAnimationFrame(frame);
  };
}

export function cleanQrPayload(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function displayToken(payload: string): string {
  return payload.startsWith(QR_TOKEN_PREFIX)
    ? payload.slice(QR_TOKEN_PREFIX.length)
    : payload;
}
