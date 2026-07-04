// AmmiAI auth context. Handles Google (Emergent-managed) + mock phone OTP.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { api, clearToken, getToken, setToken } from "@/src/api";
import type { Profile, User } from "@/src/types";

const EMERGENT_SESSION_API =
  "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data";

type AuthState = {
  status: "loading" | "unauth" | "authed";
  user: User | null;
  profile: Profile | null;
};

type AuthContextValue = AuthState & {
  signInWithGoogle: () => Promise<void>;
  processGoogleSessionId: (sessionId: string) => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<{ hint?: string }>;
  verifyPhoneOtp: (phone: string, code: string, name?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<Profile>;
  logout: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    profile: null,
  });

  const loadMe = useCallback(async () => {
    const tok = await getToken();
    if (!tok) {
      setState({ status: "unauth", user: null, profile: null });
      return;
    }
    try {
      const data = await api.get<{ user: User; profile: Profile | null }>(
        "/api/auth/me",
      );
      setState({ status: "authed", user: data.user, profile: data.profile });
    } catch {
      await clearToken();
      setState({ status: "unauth", user: null, profile: null });
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const processGoogleSessionId = useCallback(
    async (sessionId: string) => {
      const res = await fetch(EMERGENT_SESSION_API, {
        headers: { "X-Session-ID": sessionId },
      });
      if (!res.ok) throw new Error("Emergent session verification failed");
      const data = await res.json();
      const backendResp = await api.post<{ session_token: string; user: User }>(
        "/api/auth/google/session",
        { session_token: data.session_token },
        false,
      );
      await setToken(backendResp.session_token);
      await loadMe();
    },
    [loadMe],
  );

  const signInWithGoogle = useCallback(async () => {
    let redirectUrl: string;
    if (Platform.OS === "web") {
      redirectUrl = window.location.origin + "/";
    } else {
      // Use the concrete route we ship (`/auth-callback`) so if Android
      // deep-links back into the app instead of returning to
      // openAuthSessionAsync (happens on some OEMs / cold launches), the
      // route exists and can complete the flow.
      redirectUrl = Linking.createURL("auth-callback");
    }
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) {
      // If the user cancels or the OS routes via deep link, /auth-callback
      // will pick it up. Just bail here.
      return;
    }
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.replace(/^#/, "") || url.search);
    const sid = params.get("session_id");
    if (!sid) return;
    await processGoogleSessionId(sid);
  }, [processGoogleSessionId]);

  // Native: handle deep links delivered while the app is alive OR at cold
  // start. When Emergent Google Auth redirects to `ammiai://auth-callback`
  // and Android launches (or foregrounds) the app with the URL, we parse
  // the session_id here as a safety net.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        const q = new URLSearchParams(
          parsed.hash.replace(/^#/, "") || parsed.search.replace(/^\?/, ""),
        );
        const sid = q.get("session_id");
        if (sid) await processGoogleSessionId(sid);
      } catch {
        /* ignore malformed deep-link */
      }
    };
    // Cold-start URL (app not running when link tapped).
    Linking.getInitialURL().then(handleUrl).catch(() => {
      /* ignore */
    });
    // Warm listener (app already running).
    const sub = Linking.addEventListener("url", (evt) => handleUrl(evt.url));
    return () => sub.remove();
  }, [processGoogleSessionId]);

  // Web-only: handle redirect return with #session_id / ?session_id on mount.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const parseAndProcess = async () => {
      const hash = window.location.hash?.replace(/^#/, "") || "";
      const search = window.location.search?.replace(/^\?/, "") || "";
      const p = new URLSearchParams(hash || search);
      const sid = p.get("session_id");
      if (!sid) return;
      try {
        await processGoogleSessionId(sid);
      } catch {
        /* ignore */
      } finally {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
    parseAndProcess();
  }, [processGoogleSessionId]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    return await api.post<{ hint?: string }>(
      "/api/auth/phone/send",
      { phone },
      false,
    );
  }, []);

  const verifyPhoneOtp = useCallback(
    async (phone: string, code: string, name?: string) => {
      const resp = await api.post<{ session_token: string; user: User }>(
        "/api/auth/phone/verify",
        { phone, code, name },
        false,
      );
      await setToken(resp.session_token);
      await loadMe();
    },
    [loadMe],
  );

  const refreshProfile = useCallback(async () => {
    if (state.status !== "authed") return;
    const profile = await api.get<Profile>("/api/profile");
    setState((s) => ({ ...s, profile }));
  }, [state.status]);

  const saveProfile = useCallback(async (patch: Partial<Profile>) => {
    const profile = await api.put<Profile>("/api/profile", patch);
    setState((s) => ({ ...s, profile }));
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      /* ignore */
    }
    await clearToken();
    setState({ status: "unauth", user: null, profile: null });
  }, []);

  const resetOnboarding = useCallback(async () => {
    await api.post("/api/profile/reset", {});
    await refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signInWithGoogle,
      processGoogleSessionId,
      sendPhoneOtp,
      verifyPhoneOtp,
      refreshProfile,
      saveProfile,
      logout,
      resetOnboarding,
    }),
    [
      state,
      signInWithGoogle,
      processGoogleSessionId,
      sendPhoneOtp,
      verifyPhoneOtp,
      refreshProfile,
      saveProfile,
      logout,
      resetOnboarding,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
