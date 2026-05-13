const STORAGE_KEY = "food-choice-erp.device-id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback if crypto.randomUUID is missing (very old environments).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "no-storage";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateId();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage may be disabled in some webviews; we'll regenerate next call */
    }
  }
  return id;
}