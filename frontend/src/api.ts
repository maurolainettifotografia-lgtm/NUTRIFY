import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "auth_token";

let inMemoryToken: string | null = null;

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
  let url = `${BASE}/api${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (inMemoryToken) headers.Authorization = `Bearer ${inMemoryToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    await clearToken();
    throw new ApiError("Não autenticado", 401);
  }
  if (!res.ok) {
    let detail = "Erro na requisição";
    try {
      const j = await res.json();
      detail = j.detail || detail;
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
