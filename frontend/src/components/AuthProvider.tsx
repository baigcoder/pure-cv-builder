"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { accountsEnabled, getSupabase } from "@/lib/supabase";

interface AuthResult {
  error: string | null;
  /** True when sign-up succeeded but the project requires email confirmation. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** A fresh access token for API calls, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const friendlyAuthError = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (lower.includes("already registered")) return "An account with this email already exists. Sign in instead.";
  if (lower.includes("password should be")) return message;
  if (lower.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (lower.includes("failed to fetch")) return "Can't reach the sign-in service. Check your connection.";
  return message || "Something went wrong. Please try again.";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(accountsEnabled);

  useEffect(() => {
    // Without accounts, `loading` already starts false.
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts are not enabled." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts are not enabled." };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts are not enabled." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts are not enabled." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    // getSession refreshes the token first if it is about to expire.
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: accountsEnabled,
      loading,
      user: session?.user ?? null,
      session,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      getAccessToken,
    }),
    [getAccessToken, loading, sendPasswordReset, session, signIn, signOut, signUp, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
