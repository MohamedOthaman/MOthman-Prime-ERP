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

async function runWebhook(
  action: Extract<Action, { type: "webhook" }>,
  event: TriggerEvent,
): Promise<void> {
  const body = JSON.stringify({ trigger: event.type, payload: event.payload, eventId: event.id });
  const response = await fetch(action.url, {
    method: action.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(action.headers ?? {}),
    },
    body: action.method === "GET" ? undefined : body,
  });
  if (!response.ok) {
    throw new Error(`Webhook responded with HTTP ${response.status}: ${action.url}`);
  }
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
