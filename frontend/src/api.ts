// Central API client with bearer-token support.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const SESSION_KEY = "ammiai.session_token";

async function _fetch<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = await storage.secureGet(SESSION_KEY, "");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw
  }
  if (!res.ok) {
    const message =
      (typeof body === "object" && body && "detail" in (body as any)
        ? (body as any).detail
        : text) || `HTTP ${res.status}`;
    const err: any = new Error(String(message));
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, auth = true) => _fetch<T>(path, { method: "GET" }, auth),
  post: <T>(path: string, data?: unknown, auth = true) =>
    _fetch<T>(
      path,
      { method: "POST", body: data ? JSON.stringify(data) : undefined },
      auth,
    ),
  put: <T>(path: string, data?: unknown, auth = true) =>
    _fetch<T>(
      path,
      { method: "PUT", body: data ? JSON.stringify(data) : undefined },
      auth,
    ),
  patch: <T>(path: string, data?: unknown, auth = true) =>
    _fetch<T>(
      path,
      { method: "PATCH", body: data ? JSON.stringify(data) : undefined },
      auth,
    ),
  del: <T>(path: string, auth = true) =>
    _fetch<T>(path, { method: "DELETE" }, auth),
};

export const setToken = (t: string) => storage.secureSet(SESSION_KEY, t);
export const clearToken = () => storage.secureRemove(SESSION_KEY);
export const getToken = () => storage.secureGet(SESSION_KEY, "");
