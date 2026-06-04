import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { AutomationRule, RuleRun } from "./types";
import { loadRules, loadRuns, saveRules } from "./engine";

export function useAutomationRules() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules().then((r) => {
      setRules(r);
      setLoading(false);
    });
  }, []);

  const addRule = useCallback(
    async (draft: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date().toISOString();
      const rule: AutomationRule = { ...draft, id: uuidv4(), createdAt: now, updatedAt: now };
      const next = [...rules, rule];
      await saveRules(next);
      setRules(next);
      return rule;
    },
    [rules],
  );

  const updateRule = useCallback(
    async (id: string, patch: Partial<Omit<AutomationRule, "id" | "createdAt">>) => {
      const next = rules.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      );
      await saveRules(next);
      setRules(next);
    },
    [rules],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      const next = rules.filter((r) => r.id !== id);
      await saveRules(next);
      setRules(next);
    },
    [rules],
  );

  const toggleRule = useCallback(
    (id: string, enabled: boolean) => updateRule(id, { enabled }),
    [updateRule],
  );

  return { rules, loading, addRule, updateRule, deleteRule, toggleRule };
}

export function useAutomationRuns(limit = 50) {
  const [runs, setRuns] = useState<RuleRun[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    loadRuns().then((r) => {
      setRuns(r.slice(0, limit));
      setLoading(false);
    });
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, loading, refresh };
}
