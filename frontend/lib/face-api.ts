const FACE_API_SCRIPT_URL = "/face-api/face-api.min.js";
const FACE_API_MODEL_URL = "/face-api/model/";
const DESCRIPTOR_SIZE = 128;

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FaceApiDetection {
  descriptor: Float32Array | number[];
  detection: { box: FaceBox };
}

interface FaceApi {
  nets: {
    tinyFaceDetector: { loadFromUri(uri: string): Promise<void> };
    faceLandmark68Net: { loadFromUri(uri: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(uri: string): Promise<void> };
  };
  TinyFaceDetectorOptions: new () => object;
  detectAllFaces(
    input: HTMLVideoElement,
    options: object,
  ): {
    withFaceLandmarks(): {
      withFaceDescriptors(): Promise<FaceApiDetection[]>;
    };
  };
}

declare global {
  interface Window {
    faceapi?: FaceApi;
  }
}

export class FaceDetectionError extends Error {}

export interface CapturedFaceFeatures {
  descriptor: number[];
  center: [number, number];
  thumbnail: string;
}

let loader: Promise<FaceApi> | null = null;

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FACE_API_SCRIPT_URL}"]`);
    if (existing && window.faceapi) {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = FACE_API_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new FaceDetectionError("Face recognition library could not be loaded.")),
      { once: true },
    );
    if (!existing) document.head.appendChild(script);
  });
}

export function loadFaceApi(): Promise<FaceApi> {
  if (!loader) {
    loader = (async () => {
      await loadScript();
      const api = window.faceapi;
      if (!api) throw new FaceDetectionError("Face recognition library is unavailable.");
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
        api.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
        api.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
      ]);
      return api;
    })().catch((error: unknown) => {
      loader = null;
      throw error;
    });
  }
  return loader;
}

export async function captureFaceFeatures(
  video: HTMLVideoElement,
  maxWidth = 480,
  quality = 0.78,
): Promise<CapturedFaceFeatures> {
  const api = await loadFaceApi();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new FaceDetectionError("Camera preview is not ready yet.");
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxWidth / sourceWidth);
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new FaceDetectionError("Unable to process camera frame.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const detections = await api
    .detectAllFaces(video, new api.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length !== 1) {
    throw new FaceDetectionError(
      detections.length === 0 ? "No face detected. Try again." : "Exactly one face must be visible.",
    );
  }

  const detected = detections[0];
  const descriptor = Array.from(detected.descriptor);
  if (descriptor.length !== DESCRIPTOR_SIZE) {
    throw new FaceDetectionError("Face data could not be generated. Try again.");
  }
  const { x, y, width, height } = detected.detection.box;
  return {
    descriptor,
    center: [x + width / 2, y + height / 2],
    thumbnail: canvas.toDataURL("image/jpeg", quality),
  };
}

export function faceDetectionErrorMessage(error: unknown): string {
  if (error instanceof FaceDetectionError) return error.message;
  return error instanceof Error ? error.message : "Face detection failed. Try again.";
}
