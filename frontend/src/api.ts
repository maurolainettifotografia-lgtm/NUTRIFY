import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "")).trim().replace(/\/+$/, "");
export const TOKEN_KEY = "auth_token";

let inMemoryToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function subscribeSessionExpired(handler: () => void) {
  onSessionExpired = handler;
  return () => { if (onSessionExpired === handler) onSessionExpired = null; };
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken() {
  return inMemoryToken;
}

export async function loadStoredToken(): Promise<string | null> {
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  inMemoryToken = t && t.length > 0 ? t : null;
  return inMemoryToken;
}

export async function persistToken(token: string) {
  inMemoryToken = token;
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  inMemoryToken = null;
  await storage.secureRemove(TOKEN_KEY);
}

type Options = {
  method?: string;
  body?: any;
  params?: Record<string, string | number | undefined>;
};

export async function apiFetch<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, params } = opts;
  if (!/^https?:\/\//i.test(BACKEND_URL)) {
    throw new ApiError("Configure EXPO_PUBLIC_BACKEND_URL no frontend/.env e reinicie o Expo.", 0);
  }
  let url = `${BACKEND_URL}/api${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const requestToken = inMemoryToken;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (inMemoryToken) headers.Authorization = `Bearer ${inMemoryToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && requestToken && requestToken === inMemoryToken) {
    await clearToken();
    onSessionExpired?.();
    throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
  }
  if (!res.ok) {
    let detail = "Erro na requisição";
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((e: { msg?: string }) => e.msg?.replace(/^Value error, /, "")).filter(Boolean).join(" ") || detail : detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
