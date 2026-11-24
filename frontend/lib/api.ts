import { isRecord, normalizePaginated, pick, str } from "@/lib/normalize";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
const isLocalApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(
  configuredApiUrl ?? "",
);
const useSameOriginApi =
  process.env.NODE_ENV === "production" && (!configuredApiUrl || isLocalApiUrl);

export const API_BASE_URL = useSameOriginApi
  ? "/api/v1"
  : configuredApiUrl || "http://localhost:8000/api/v1";

export type QueryValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  responseType?: "json" | "blob";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly fields: Record<string, string>;
  readonly requestId?: string;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    fields?: Record<string, string>;
    requestId?: string;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? {};
    this.fields = options.fields ?? {};
    this.requestId = options.requestId;
  }
}

let accessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

export function subscribeToAccessToken(
  listener: (token: string | null) => void,
): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function signalUnauthorized(): void {
  setAccessToken(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth:unauthorized"));
  }
}

export function buildUrl(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
  const url = new URL(base);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, str(item)));
        return;
      }
      url.searchParams.set(
        key,
        value instanceof Date ? value.toISOString() : str(value),
      );
    });
  }
  return url.toString();
}

function extractFields(payload: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  const envelope = isRecord(payload) ? payload : {};
  const error = isRecord(envelope.error) ? envelope.error : envelope;
  const details = isRecord(error.details) ? error.details : {};
  const rootDetail = error.detail ?? envelope.detail;

  Object.entries(details).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      fields[key] = value.map((item) => str(item)).join(", ");
    } else if (isRecord(value)) {
      fields[key] = pick(value, ["message", "msg", "error"], JSON.stringify(value));
    } else if (value !== undefined && value !== null) {
      fields[key] = str(value);
    }
  });

  if (Array.isArray(rootDetail)) {
    rootDetail.forEach((item) => {
      if (!isRecord(item)) return;
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part) => part !== "body" && part !== "query").join(".")
        : str(item.loc);
      if (location) {
        fields[location] = pick(item, ["msg", "message"], "Invalid value");
      }
    });
  }

  return fields;
}

async function parseApiError(response: Response): Promise<ApiError> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    return new ApiError({
      status: response.status,
      code: "request_failed",
      message: text || `Request failed with status ${response.status}`,
    });
  }

  const envelope = isRecord(payload) ? payload : {};
  const error = isRecord(envelope.error) ? envelope.error : envelope;
  const code = pick(error, ["code", "error_code", "detail"], "request_failed");
  const message =
    pick(error, ["message", "detail", "msg"], "") ||
    pick(envelope, ["message", "detail"], "") ||
    `Request failed with status ${response.status}`;

  return new ApiError({
    status: response.status,
    code: typeof code === "string" ? code : "request_failed",
    message: typeof message === "string" ? message : str(message),
    details: isRecord(error.details) ? error.details : {},
    fields: extractFields(payload),
    requestId: pick(error, ["request_id"]),
  });
}

let refreshPromise: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const attempt = (async () => {
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });
      if (!response.ok) return false;
      const payload: unknown = await response.json().catch(() => undefined);
      const token = pick(isRecord(payload) ? payload : {}, [
        "access_token",
        "accessToken",
        "token",
      ]);
      if (!token) return false;
      setAccessToken(token);
      return true;
    } catch {
      return false;
    }
  })();

  refreshPromise = attempt;
  void attempt.finally(() => {
    if (refreshPromise === attempt) refreshPromise = null;
  });
  return attempt;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: options.responseType === "blob" ? "*/*" : "application/json",
    ...options.headers,
  };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = getAccessToken();
  if (token && !options.skipAuth) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: `Unable to reach the API at ${API_BASE_URL}. Start the backend or check NEXT_PUBLIC_API_URL.`,
    });
  }

  if (response.status === 401 && !options.skipAuth && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest<T>(path, options, false);
    signalUnauthorized();
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }

  if (options.responseType === "blob") {
    return (await response.blob()) as T;
  }

  return (await response.json().catch(() => undefined)) as T;
}

export const api = {
  request: apiRequest,
  get<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return apiRequest<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return apiRequest<T>(path, { ...options, method: "POST", body });
  },
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return apiRequest<T>(path, { ...options, method: "PATCH", body });
  },
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return apiRequest<T>(path, { ...options, method: "PUT", body });
  },
  delete<T>(path: string, options?: ApiRequestOptions) {
    return apiRequest<T>(path, { ...options, method: "DELETE" });
  },
  getPaginated<T>(
    path: string,
    mapper: (item: unknown) => T,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ) {
    return apiRequest<unknown>(path, { ...options, method: "GET" }).then((payload) =>
      normalizePaginated(payload, mapper),
    );
  },
  async download(
    path: string,
    filename: string,
    query?: Record<string, QueryValue>,
  ): Promise<void> {
    const blob = await apiRequest<Blob>(path, {
      query,
      responseType: "blob",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function serverFieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const key = Object.keys(error.fields).find(
    (candidate) => candidate === field || candidate.endsWith(`.${field}`),
  );
  return key ? error.fields[key] : undefined;
}
