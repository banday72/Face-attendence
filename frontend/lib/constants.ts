export const CONSENT_VERSION = "1.0";
export const FACE_FRAME_COUNT = 4;
export const QR_TOKEN_PREFIX = "uat:v1:";
export const DEFAULT_PAGE_SIZE = 20;
export const LIVE_REFRESH_MS = 5000;
export const sessionQrStorageKey = (sessionId: string) => `face-attendance:live-qr:${sessionId}`;

export const FACE_CHALLENGES = [
  { key: "turn_left", label: "Turn your head slowly to the left" },
  { key: "turn_right", label: "Turn your head slowly to the right" },
  { key: "blink", label: "Blink naturally twice" },
  { key: "center", label: "Look straight at the camera" },
] as const;

export type FaceChallengeKey = (typeof FACE_CHALLENGES)[number]["key"];
