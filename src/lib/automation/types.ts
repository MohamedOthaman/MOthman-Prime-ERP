// ─── Trigger types ─────────────────────────────────────────────────────────────

export type TriggerType =
  | "ocr.completed"
  | "stock.low"
  | "invoice.posted"
  | "sync.failed";

export interface OcrCompletedPayload {
  documentId: string;
  itemCount: number;
  warnings: string[];
}

export interface StockLowPayload {
  itemId: string;
  itemName: string;
  currentQty: number;
  minQty: number;
}

export interface InvoicePostedPayload {
  invoiceId: string;
  total: number;
  currency: string;
  customerId: string;
  customerName: string;
}

export interface SyncFailedPayload {
  error: string;
  pendingCount: number;
}

export interface TriggerPayloads {
  "ocr.completed": OcrCompletedPayload;
  "stock.low": StockLowPayload;
  "invoice.posted": InvoicePostedPayload;
  "sync.failed": SyncFailedPayload;
}

export interface TriggerEvent<T extends TriggerType = TriggerType> {
  /** Unique ID for idempotency checks. */
  id: string;
  type: T;
  payload: TriggerPayloads[T];
  timestamp: string; // ISO 8601
}

// ─── Action types ───────────────────────────────────────────────────────────────

export interface WebhookAction {
  type: "webhook";
  /** Target URL. Use an n8n Webhook node URL to bridge to n8n workflows. */
  url: string;
  method?: "GET" | "POST";
  /** Additional HTTP headers (e.g. Authorization). */
  headers?: Record<string, string>;
}

export interface NotificationAction {
  type: "notification";
  /** Title supports {{payload.field}} template placeholders. */
  title: string;
  body: string;
}

export interface ApprovalAction {
  type: "approval";
  title: string;
  body: string;
  /** Role key used to look up approvers; informational for now. */
  approverRole?: string;
}

export type Action = WebhookAction | NotificationAction | ApprovalAction;

// ─── Automation rule ────────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerType;
  /**
   * Optional guard expression evaluated against the trigger payload.
   * Format: `"payload.<path> <op> <value>"` where op ∈ {>, <, >=, <=, ===, !==}.
   * Example: `"payload.warnings.length > 0"`
   * When omitted or unparseable the rule always runs.
   */
  condition?: string;
  actions: Action[];
  createdAt: string;
  updatedAt: string;
}

// ─── Run history ────────────────────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface ActionRun {
  actionIndex: number;
  actionType: Action["type"];
  status: RunStatus;
  error?: string;
  durationMs?: number;
}

export interface RuleRun {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: TriggerType;
  /** The originating event ID (used for idempotency). */
  eventId: string;
  status: RunStatus;
  actions: ActionRun[];
  startedAt: string;
  completedAt?: string;
}
