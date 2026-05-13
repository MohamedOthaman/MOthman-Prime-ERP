import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NetworkStatus {
  isOnline: boolean;
  supabaseReachable: boolean;
  lastOnlineAt: number | null;
  lastCheckedAt: number | null;
}

const HEALTH_PING_INTERVAL_MS = 30_000;

async function pingSupabase(signal: AbortSignal): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("products")
      .select("id")
      .limit(1)
      .abortSignal(signal);
    return !error;
  } catch {
    return false;
  }
}

export function useNetworkStatus(): NetworkStatus {
  const initialOnline =
    typeof navigator !== "undefined" ? navigator.onLine : true;

  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: initialOnline,
    supabaseReachable: initialOnline,
    lastOnlineAt: initialOnline ? Date.now() : null,
    lastCheckedAt: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runHealthCheck = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cancelled) {
          setStatus((prev) => ({
            ...prev,
            isOnline: false,
            supabaseReachable: false,
            lastCheckedAt: Date.now(),
          }));
        }
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const reachable = await pingSupabase(controller.signal);
      if (cancelled) return;

      setStatus((prev) => ({
        isOnline: reachable || prev.isOnline,
        supabaseReachable: reachable,
        lastOnlineAt: reachable ? Date.now() : prev.lastOnlineAt,
        lastCheckedAt: Date.now(),
      }));
    };

    const handleOnline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: true,
        lastOnlineAt: Date.now(),
      }));
      void runHealthCheck();
    };

    const handleOffline = () => {
      abortRef.current?.abort();
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
        supabaseReachable: false,
        lastCheckedAt: Date.now(),
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void runHealthCheck();
    const intervalId = window.setInterval(runHealthCheck, HEALTH_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, []);

  return status;
}
