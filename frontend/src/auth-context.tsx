import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { apiFetch, clearToken, loadStoredToken, persistToken, setAuthToken, subscribeSessionExpired } from "@/src/api";
import { requestAppleCredential } from "@/src/apple-signin";

import { queryClient } from "@/src/query-client";

WebBrowser.maybeCompleteAuthSession();

export type AppUser = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  onboarded: boolean;
};

type AuthState = {
  user: AppUser | null;
  loading: boolean;
  signingIn: boolean;
  signInWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setOnboarded: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const processedIds = useRef<Set<string>>(new Set());
  const capturedUrl = useRef<string | null>(null);

  const exchangeSession = useCallback(async (sessionId: string) => {
    if (!sessionId || processedIds.current.has(sessionId)) return;
    processedIds.current.add(sessionId);
    setSigningIn(true);
    try {
      const data = await apiFetch<{ session_token: string; user: AppUser }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
      });
      await persistToken(data.session_token);
      queryClient.clear();
      setUser(data.user);
    } catch (e) {
      processedIds.current.delete(sessionId);
      console.error("session exchange failed", e);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiFetch<AppUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => subscribeSessionExpired(() => {
    queryClient.clear();
    setUser(null);
  }), []);

  // Bootstrap on mount
  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      // Web: process session_id from URL first
      if (Platform.OS === "web") {
        const href = typeof window !== "undefined" ? window.location.href : "";
        const sid = extractSessionId(href);
        if (sid) {
          await exchangeSession(sid);
          try {
            const url = new URL(window.location.href);
            url.hash = "";
            url.searchParams.delete("session_id");
            window.history.replaceState(window.history.state, "", url.toString());
          } catch {}
          if (mounted) setLoading(false);
          return;
        }
      } else {
        const initial = await Linking.getInitialURL();
        const sid = extractSessionId(initial) || extractSessionId(capturedUrl.current);
        if (sid) {
          await exchangeSession(sid);
          if (mounted) setLoading(false);
          return;
        }
      }
      // Otherwise check stored token
      const token = await loadStoredToken();
      if (token) {
        await refreshUser();
      }
      if (mounted) setLoading(false);
    };
    boot().catch((error) => {
      console.error("Falha ao restaurar sessão", error);
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [exchangeSession, refreshUser]);

  // Mobile deep link listener
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      capturedUrl.current = url;
      const sid = extractSessionId(url);
      if (sid) exchangeSession(sid);
    });
    return () => sub.remove();
  }, [exchangeSession]);

  const signInWithEmail = useCallback(async (email: string, password: string, name?: string) => {
    setSigningIn(true);
    try {
      const data = await apiFetch<{ session_token: string; user: AppUser }>(name === undefined ? "/auth/login" : "/auth/register-pin", {
        method: "POST", body: { email, password, ...(name === undefined ? {} : { name }) },
      });
      await persistToken(data.session_token);
      queryClient.clear();
      setUser(data.user);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      if (Platform.OS === "web") {
        const redirectUrl = window.location.origin + "/";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        return;
      }
      const redirectUrl = Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let sid: string | null = null;
      if (result.type === "success" && result.url) {
        sid = extractSessionId(result.url);
      }
      if (!sid) sid = extractSessionId(capturedUrl.current);
      if (!sid) sid = extractSessionId(await Linking.getInitialURL());
      if (sid) await exchangeSession(sid);
    } catch (e) {
      console.error("google sign in error", e);
    } finally {
      setSigningIn(false);
    }
  }, [exchangeSession]);

  const signInWithApple = useCallback(async () => {
    setSigningIn(true);
    try {
      const cred = await requestAppleCredential();
      if (!cred) return; // a pessoa cancelou
      const data = await apiFetch<{ session_token: string; user: AppUser }>("/auth/apple", { method: "POST", body: cred });
      await persistToken(data.session_token);
      queryClient.clear();
      setUser(data.user);
    } catch (e) {
      console.error("apple sign in error", e);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setAuthToken(null);
    queryClient.clear();
    processedIds.current.clear();
    capturedUrl.current = null;
    setUser(null);
  }, []);

  const setOnboarded = useCallback(() => {
    setUser((u) => (u ? { ...u, onboarded: true } : u));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signingIn, signInWithEmail, signInWithGoogle, signInWithApple, signOut, refreshUser, setOnboarded }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
