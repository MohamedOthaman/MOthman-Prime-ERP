import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getAppUrl } from "@/config/appUrl";

const LOCAL_SESSION_KEY = "prime-local-session";

interface LocalSession {
  role: string;
  loginTime: number;
}

function makeLocalUser(role: string): User {
  return {
    id: `local-${role}`,
    email: `${role}@local.erp`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: { full_name: role },
    aud: "authenticated",
    role: "",
    factors: [],
    identities: [],
    last_sign_in_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    is_anonymous: false,
  } as unknown as User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: unknown }>;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signInWithRole: (role: string) => void;
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
    // Local role session takes priority over Supabase auth
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      try {
        const parsed: LocalSession = JSON.parse(raw);
        setRole(parsed.role);
        setUser(makeLocalUser(parsed.role));
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem(LOCAL_SESSION_KEY);
      }
    }

    const fetchUserRole = async (userId?: string, email?: string | null) => {
      if (!userId) { setRole("read_only"); return; }
      if (email?.toLowerCase() === "mohamed22othman@yahoo.com") { setRole("owner"); return; }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      setRole(error || !data?.role ? "read_only" : data.role);
    };

    const handleSession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      await fetchUserRole(s?.user?.id, s?.user?.email ?? null);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      initializedRef.current = true;
      void handleSession(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!initializedRef.current) return;
      void handleSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithRole = (selectedRole: string) => {
    const localSession: LocalSession = { role: selectedRole, loginTime: Date.now() };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(localSession));
    setRole(selectedRole);
    setUser(makeLocalUser(selectedRole));
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: getAppUrl() },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole("read_only");
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signUp, signIn, signInWithRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
