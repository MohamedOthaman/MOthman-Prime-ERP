import { get as idbGet, set as idbSet } from "idb-keyval";
import type { AutomationRule, RuleRun } from "./types";

const KEY_RULES = "automation:rules";
const KEY_RUNS = "automation:runs";
const MAX_RUN_HISTORY = 200;

export async function loadRules(): Promise<AutomationRule[]> {
  return (await idbGet<AutomationRule[]>(KEY_RULES)) ?? [];
}

export async function saveRules(rules: AutomationRule[]): Promise<void> {
  await idbSet(KEY_RULES, rules);
}

export async function loadRuns(): Promise<RuleRun[]> {
  return (await idbGet<RuleRun[]>(KEY_RUNS)) ?? [];
}

export async function appendRun(run: RuleRun): Promise<void> {
  const existing = await loadRuns();
  const trimmed = [run, ...existing].slice(0, MAX_RUN_HISTORY);
  await idbSet(KEY_RUNS, trimmed);
}

export async function updateRun(updated: RuleRun): Promise<void> {
  const existing = await loadRuns();
  const index = existing.findIndex((r) => r.id === updated.id);
  if (index !== -1) {
    existing[index] = updated;
  } else {
    existing.unshift(updated);
  }
  await idbSet(KEY_RUNS, existing.slice(0, MAX_RUN_HISTORY));
}
