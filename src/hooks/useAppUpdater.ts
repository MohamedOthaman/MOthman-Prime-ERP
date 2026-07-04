import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime as isTauri } from "@/platform/runtime";

export type UpdateChannel = "stable" | "beta" | "internal";

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
  channel: UpdateChannel;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
  percent: number | null;
}

export type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "downloading"; progress: DownloadProgress }
  | { status: "ready" }
  | { status: "error"; message: string };

// Poll for updates every 4 hours
const POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;
// First check is delayed 8 seconds after startup (let the app settle)
const INITIAL_DELAY_MS = 8_000;

export function useAppUpdater() {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });
  const [channel, setChannelState] = useState<UpdateChannel>("stable");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // ── Subscribe to download progress events from Rust ───────────────────────
  useEffect(() => {
    if (!isTauri()) return;

    let mounted = true;

    listen<DownloadProgress>("update-download-progress", (event) => {
      if (!mounted) return;
      setState({ status: "downloading", progress: event.payload });
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, []);

  // ── Read stored channel on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>("get_update_channel")
      .then((ch) => setChannelState(ch as UpdateChannel))
      .catch(() => {});
  }, []);

  // ── Core: check for updates ───────────────────────────────────────────────
  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return;
    setState({ status: "checking" });
    try {
      const info = await invoke<UpdateInfo | null>("check_update");
      if (info) {
        setState({ status: "available", info });
      } else {
        setState({ status: "idle" });
      }
    } catch (err) {
      // Silently ignore network errors during background checks
      setState({ status: "idle" });
      console.warn("[updater] check failed:", err);
    }
  }, []);

  // ── Core: download and install ────────────────────────────────────────────
  const installUpdate = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await invoke("install_update");
      // On Windows passive mode: installer launches, app may close automatically.
      // We surface a "ready to restart" state for explicit restart scenarios.
      setState({ status: "ready" });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, []);

  // ── Core: switch release channel ──────────────────────────────────────────
  const switchChannel = useCallback(async (newChannel: UpdateChannel) => {
    if (!isTauri()) return;
    await invoke("set_update_channel", { channel: newChannel });
    setChannelState(newChannel);
  }, []);

  const dismiss = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  // ── Schedule automatic background checks ─────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return;

    // First check after a short delay
    timerRef.current = setTimeout(() => {
      checkForUpdate();

      // Then poll on a regular interval
      pollRef.current = setInterval(checkForUpdate, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkForUpdate]);

  return {
    state,
    channel,
    checkForUpdate,
    installUpdate,
    switchChannel,
    dismiss,
    isUpdateAvailable: state.status === "available",
    isDownloading: state.status === "downloading",
    isReady: state.status === "ready",
  };
}
