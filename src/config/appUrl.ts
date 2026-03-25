/**
 * Returns the base app URL for redirects (Supabase reset password, etc.).
 * Uses VITE_APP_URL if set (for mobile/deployed), otherwise falls back to window.location.origin.
 */
export function getAppUrl(): string {
  const envUrl = import.meta.env.VITE_APP_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    return envUrl.trim().replace(/\/+$/, ""); // remove trailing slash
  }
  return window.location.origin;
}
