import { v4 as uuidv4 } from "uuid";
import type { AutomationRule, TriggerEvent, TriggerType, RuleRun, ActionRun } from "./types";
import { loadRules, loadRuns, appendRun, updateRun } from "./storage";
import { runAction } from "./actions";

// ─── Condition evaluator ─────────────────────────────────────────────────────────
// Evaluates simple guard expressions without eval().
// Supported form: `payload.<path> <op> <literal>`
// Ops: > < >= <= === !== == !=
// Literals: numbers, quoted strings, true, false, null

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function parseLiteral(raw: string): unknown {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

const CONDITION_RE = /^([\w.]+)\s*(>=|<=|===|!==|==|!=|>|<)\s*(.+)$/;

export function evaluateCondition(condition: string, event: TriggerEvent): boolean {
  try {
    const m = condition.trim().match(CONDITION_RE);
    if (!m) return true; // unparseable → run
    const [, leftPath, op, rightRaw] = m;
    const leftVal = getNestedValue(event, leftPath);
    const rightVal = parseLiteral(rightRaw);

    switch (op) {
      case ">":    return (leftVal as number) > (rightVal as number);
      case "<":    return (leftVal as number) < (rightVal as number);
      case ">=":   return (leftVal as number) >= (rightVal as number);
      case "<=":   return (leftVal as number) <= (rightVal as number);
      case "===":
      case "==":   return leftVal === rightVal;
      case "!==":
      case "!=":   return leftVal !== rightVal;
      default:     return true;
    }
  } catch {
    return true; // on any error, run the rule
  }
}

// ─── Idempotency check ──────────────────────────────────────────────────────────

async function wasEventProcessed(ruleId: string, eventId: string): Promise<boolean> {
  const runs = await loadRuns();
  return runs.some(
    (r) => r.ruleId === ruleId && r.eventId === eventId && r.status !== "failed",
  );
}

// ─── Rule execution ─────────────────────────────────────────────────────────────

async function executeRule(rule: AutomationRule, event: TriggerEvent): Promise<void> {
  // Idempotency: skip if this event was already successfully processed for this rule.
  if (await wasEventProcessed(rule.id, event.id)) {
    return;
  }

  const run: RuleRun = {
    id: uuidv4(),
    ruleId: rule.id,
    ruleName: rule.name,
    trigger: event.type,
    eventId: event.id,
    status: "running",
    actions: rule.actions.map((_, i) => ({
      actionIndex: i,
      actionType: rule.actions[i].type,
      status: "pending",
    })),
    startedAt: new Date().toISOString(),
  };

  await appendRun(run);

  let overallStatus: RuleRun["status"] = "success";

  for (let i = 0; i < rule.actions.length; i++) {
    const actionRun: ActionRun = { ...run.actions[i], status: "running" };
    run.actions[i] = actionRun;
    const t0 = Date.now();
    try {
      await runAction(rule.actions[i], event);
      run.actions[i] = { ...actionRun, status: "success", durationMs: Date.now() - t0 };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      run.actions[i] = { ...actionRun, status: "failed", error, durationMs: Date.now() - t0 };
      overallStatus = "failed";
      // Continue executing remaining actions even if one fails.
    }
  }

  run.status = overallStatus;
  run.completedAt = new Date().toISOString();
  await updateRun(run);
}

// ─── Event bus ──────────────────────────────────────────────────────────────────
// A lightweight synchronous in-process event bus. Listeners are run in parallel.

type Listener<T extends TriggerType = TriggerType> = (event: TriggerEvent<T>) => void;

const _listeners = new Map<TriggerType, Set<Listener>>();

function on<T extends TriggerType>(type: T, listener: Listener<T>): () => void {
  if (!_listeners.has(type)) _listeners.set(type, new Set());
  const set = _listeners.get(type)!;
  set.add(listener as Listener);
  return () => set.delete(listener as Listener);
}

function emit<T extends TriggerType>(event: TriggerEvent<T>): void {
  const set = _listeners.get(event.type);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event as TriggerEvent);
    } catch (err) {
      console.error("[Automation] Listener error:", err);
    }
  }
}

// ─── Public engine API ──────────────────────────────────────────────────────────

let _engineStarted = false;
let _unsubscribe: (() => void) | null = null;

/** Start listening for trigger events and routing them to matching rules. */
export function startEngine(): void {
  if (_engineStarted) return;
  _engineStarted = true;

  const triggers: TriggerType[] = ["ocr.completed", "stock.low", "invoice.posted", "sync.failed"];
  const unsubs = triggers.map((type) =>
    on(type, async (event) => {
      let rules: AutomationRule[];
      try {
        rules = await loadRules();
      } catch {
        return;
      }
      const matching = rules.filter(
        (r) =>
          r.enabled &&
          r.trigger === event.type &&
          (!r.condition || evaluateCondition(r.condition, event)),
      );
      await Promise.allSettled(matching.map((r) => executeRule(r, event)));
    }),
  );

  _unsubscribe = () => unsubs.forEach((u) => u());
}

export function stopEngine(): void {
  _unsubscribe?.();
  _unsubscribe = null;
  _engineStarted = false;
}

/**
 * Fire a trigger event. Called from application code (OCR pipeline, invoice
 * posting, stock monitoring, sync engine) to activate matching automation rules.
 */
export function fireTrigger<T extends TriggerType>(
  type: T,
  payload: import("./types").TriggerPayloads[T],
): TriggerEvent<T> {
  const event: TriggerEvent<T> = {
    id: uuidv4(),
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  emit(event);
  return event;
}

export { loadRules, loadRuns };
export { saveRules } from "./storage";
