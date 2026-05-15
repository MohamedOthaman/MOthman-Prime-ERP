/**
 * Sidebar width persistence.
 *
 * We store a single number (width in px). Below `SIDEBAR_COLLAPSE_THRESHOLD`
 * the sidebar auto-snaps to icon-only mode. Above it, the stored width is
 * used as the expanded width.
 *
 * Browser: cookie. Desktop (Tauri): app_data file (survives reinstalls).
 */

export const SIDEBAR_WIDTH_DEFAULT = 248;
export const SIDEBAR_WIDTH_MIN_EXPANDED = 180;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_ICON = 64;
/** Drag below this width snaps to icon-only mode. */
export const SIDEBAR_COLLAPSE_THRESHOLD = 140;

const COOKIE_NAME = "sidebar:width";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const TAURI_FILE = "sidebar_width";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

function parseWidth(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function readCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return parseWidth(match.split("=")[1]);
}

function writeCookie(width: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${width}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

async function readTauriFile(): Promise<number | null> {
  try {
    const { BaseDirectory, readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    const present = await exists(TAURI_FILE, { baseDir: BaseDirectory.AppData });
    if (!present) return null;
    const raw = await readTextFile(TAURI_FILE, { baseDir: BaseDirectory.AppData });
    return parseWidth(raw.trim());
  } catch {
    return null;
  }
}

async function writeTauriFile(width: number): Promise<void> {
  try {
    const { BaseDirectory, writeTextFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const dirExists = await exists("", { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    }
    await writeTextFile(TAURI_FILE, String(width), { baseDir: BaseDirectory.AppData });
  } catch {
    // Best-effort — cookie remains authoritative for next paint.
  }
}

/**
 * Synchronous cookie read for the initial paint. Tauri WebView supports
 * cookies, so this is reliable on both browser and desktop for the common
 * case (no app-data wipe).
 */
export function readSidebarWidthSync(): number | null {
  return readCookie();
}

/**
 * Read persisted sidebar width. Tauri-first, cookie fallback.
 * Returns `null` if no persisted value exists.
 */
export async function loadSidebarWidth(): Promise<number | null> {
  if (isTauri()) {
    const tauriValue = await readTauriFile();
    if (tauriValue !== null) return tauriValue;
  }
  return readCookie();
}

/**
 * Persist sidebar width. Writes to both stores on desktop so the cookie
 * remains a valid hot-path read.
 */
export function saveSidebarWidth(width: number): void {
  writeCookie(width);
  if (isTauri()) {
    void writeTauriFile(width);
  }
}
