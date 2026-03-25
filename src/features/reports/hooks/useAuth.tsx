import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getAppUrl } from "@/config/appUrl";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("read_only");
  const initializedRef = useRef(false);

  useEffect(() => {
    const fetchUserRole = async (userId?: string, email?: string | null) => {
      if (!userId) {
        setRole("read_only");
        return;
      }

      // Temporary: hardcoded admin email
      if (email?.toLowerCase() === "mohamed22othman@yahoo.com") {
        setRole("admin");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data?.role) {
        setRole("read_only");
      } else {
        setRole(data.role);
      }
    };

    const handleSession = async (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      await fetchUserRole(session?.user?.id, session?.user?.email ?? null);
      setLoading(false);
    };

    // 1. First, get the initial session — this is the source of truth on page load
    supabase.auth.getSession().then(({ data: { session } }) => {
      initializedRef.current = true;
      void handleSession(session);
    });

    // 2. Then subscribe to auth changes for ongoing updates (sign in, sign out, token refresh)
    //    Skip events until getSession has completed to avoid race conditions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initializedRef.current) return; // skip until getSession completes
      void handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: getAppUrl(),
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole("read_only");
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}