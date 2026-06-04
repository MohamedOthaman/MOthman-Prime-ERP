import type { Action, TriggerEvent, TriggerType } from "./types";

// ─── Template rendering ─────────────────────────────────────────────────────────
// Replaces {{payload.field}} placeholders with values from the event.
function renderTemplate(template: string, event: TriggerEvent): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const parts = path.split(".");
    let value: unknown = event;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return "";
      value = (value as Record<string, unknown>)[part];
    }
    return value == null ? "" : String(value);
  });
}

// ─── Action handlers ────────────────────────────────────────────────────────────

const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_MAX_ATTEMPTS = 3;

async function runWebhook(
  action: Extract<Action, { type: "webhook" }>,
  event: TriggerEvent,
): Promise<void> {
  const body = JSON.stringify({ trigger: event.type, payload: event.payload, eventId: event.id });

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(action.url, {
        method: action.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(action.headers ?? {}),
        },
        body: action.method === "GET" ? undefined : body,
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError (timeout) and network errors are retryable.
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
      continue;
    }
    clearTimeout(timer);

    if (response.ok) return; // success

    // 4xx (except 429) is a permanent client error — do not retry.
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`Webhook HTTP ${response.status}: ${action.url}`);
    }

    // Transient 5xx / 429 — retry with exponential backoff (500ms, 1000ms).
    lastError = new Error(`Webhook HTTP ${response.status}: ${action.url}`);
    if (attempt < WEBHOOK_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error(`Webhook failed: ${action.url}`);
}

async function runNotification(
  action: Extract<Action, { type: "notification" }>,
  event: TriggerEvent,
): Promise<void> {
  const title = renderTemplate(action.title, event);
  const body = renderTemplate(action.body, event);

  // Use the Web Notifications API when available (works in Tauri webview).
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      new Notification(title, { body });
      return;
    }
  }
  // Silent fallback: log to console when notifications are unavailable.
  console.info(`[Automation] Notification — ${title}: ${body}`);
}

async function runApproval(
  action: Extract<Action, { type: "approval" }>,
  event: TriggerEvent,
): Promise<void> {
  const title = renderTemplate(action.title, event);
  const body = renderTemplate(action.body, event);
  // Approval requests are persisted in run history and surfaced via the
  // useAutomationRuns hook for the UI to render; no blocking call here.
  console.info(`[Automation] Approval requested — ${title}: ${body} (role: ${action.approverRole ?? "any"})`);
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────────

export async function runAction(action: Action, event: TriggerEvent<TriggerType>): Promise<void> {
  switch (action.type) {
    case "webhook":
      return runWebhook(action, event);
    case "notification":
      return runNotification(action, event);
    case "approval":
      return runApproval(action, event);
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action type: ${(_exhaustive as Action).type}`);
    }
  }
}
