import { useState } from "react";
import { Workflow, Plus, Trash2, Webhook, Bell, CheckSquare, Play } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import { useAutomationRules, useAutomationRuns } from "@/lib/automation/hooks";
import { fireTrigger } from "@/lib/automation";
import type { Action, AutomationRule, RunStatus, TriggerType } from "@/lib/automation/types";
import {
  DashboardShell,
  SectionCard,
  FeedRow,
  EmptyState,
  LoadingRows,
} from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Static option lists (mirror the engine's TriggerType / Action union) ───────

const TRIGGERS: TriggerType[] = ["ocr.completed", "stock.low", "invoice.posted", "sync.failed"];
const ACTION_TYPES: Action["type"][] = ["webhook", "notification", "approval"];

const TRIGGER_WIRED: Record<TriggerType, boolean> = {
  "ocr.completed": true,
  "invoice.posted": true,
  "stock.low": false,
  "sync.failed": false,
};

const ACTION_ICON: Record<Action["type"], typeof Webhook> = {
  webhook: Webhook,
  notification: Bell,
  approval: CheckSquare,
};

const runDot = (s: RunStatus): string =>
  s === "success"
    ? "bg-emerald-400"
    : s === "failed"
      ? "bg-rose-400"
      : s === "running"
        ? "bg-blue-400"
        : s === "skipped"
          ? "bg-muted-foreground/40"
          : "bg-amber-400";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Create-rule dialog ─────────────────────────────────────────────────────────

interface CreateRuleDialogProps {
  onCreate: (draft: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">) => Promise<unknown>;
}

function CreateRuleDialog({ onCreate }: CreateRuleDialogProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("ocr.completed");
  const [condition, setCondition] = useState("");
  const [actionType, setActionType] = useState<Action["type"]>("notification");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reset = () => {
    setName("");
    setTrigger("ocr.completed");
    setCondition("");
    setActionType("notification");
    setWebhookUrl("");
    setTitle("");
    setBody("");
  };

  const buildAction = (): Action | null => {
    if (actionType === "webhook") {
      if (!webhookUrl.trim()) return null;
      return { type: "webhook", url: webhookUrl.trim(), method: "POST" };
    }
    if (actionType === "notification") {
      return { type: "notification", title: title.trim() || name, body: body.trim() };
    }
    return { type: "approval", title: title.trim() || name, body: body.trim() };
  };

  const canSave =
    name.trim().length > 0 && (actionType !== "webhook" || webhookUrl.trim().length > 0);

  const handleSave = async () => {
    const action = buildAction();
    if (!action) return;
    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        enabled: true,
        trigger,
        condition: condition.trim() || undefined,
        actions: [action],
      });
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("automationNewRule", "New Rule")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("automationNewRule", "New Rule")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rule-name">{t("automationRuleName", "Rule name")}</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("automationRuleNamePlaceholder", "e.g. Notify on OCR warnings")}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("automationTrigger", "Trigger")}</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((tr) => (
                  <SelectItem key={tr} value={tr}>
                    {tr}
                    {!TRIGGER_WIRED[tr] ? ` — ${t("automationNotWired", "not fired yet")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!TRIGGER_WIRED[trigger] && (
              <p className="text-[10.5px] text-amber-600">
                {t(
                  "automationTriggerDeferred",
                  "This trigger is defined but not yet fired by the app — the rule will save but stay dormant until a producer is added.",
                )}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rule-condition">
              {t("automationCondition", "Condition")} ({t("optional", "optional")})
            </Label>
            <Input
              id="rule-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="payload.warnings.length > 0"
            />
            <p className="text-[10.5px] text-muted-foreground">
              {t("automationConditionHint", "Form: payload.<field> <op> <value>. Leave blank to always run.")}
            </p>
          </div>

          <div className="space-y-1">
            <Label>{t("automationAction", "Action")}</Label>
            <Select value={actionType} onValueChange={(v) => setActionType(v as Action["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionType === "webhook" ? (
            <div className="space-y-1">
              <Label htmlFor="rule-url">{t("automationWebhookUrl", "Webhook URL (e.g. n8n)")}</Label>
              <Input
                id="rule-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://n8n.example.com/webhook/..."
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="rule-title">{t("automationMsgTitle", "Title")}</Label>
                <Input id="rule-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-body">{t("automationMsgBody", "Message")}</Label>
                <Input id="rule-body" value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            {t("cancel", "Cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? t("saving", "Saving…") : t("save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const { t } = useLang();
  const { rules, loading: rulesLoading, addRule, deleteRule, toggleRule } = useAutomationRules();
  const { runs, loading: runsLoading, refresh } = useAutomationRuns(30);

  return (
    <DashboardShell
      icon={Workflow}
      title={t("automationTitle", "Automation")}
      subtitle={t("automationSubtitle", "Rules & run history (trigger → action)")}
      accent="violet"
      headerAction={<CreateRuleDialog onCreate={addRule} />}
    >
      {/* ── Rules ─────────────────────────────────────────────── */}
      <SectionCard
        title={t("automationRules", "Rules")}
        icon={Workflow}
        iconClass="text-violet-400"
        action={
          !rulesLoading && (
            <span className="text-[10px] font-mono text-muted-foreground">{rules.length}</span>
          )
        }
      >
        {rulesLoading ? (
          <LoadingRows count={3} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Workflow}
            message={t("automationNoRules", "No automation rules yet")}
            sub={t("automationNoRulesSub", "Create a rule to react to OCR, stock, invoice or sync events.")}
          />
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule) => {
              const action = rule.actions[0];
              const Icon = action ? ACTION_ICON[action.type] : Workflow;
              return (
                <FeedRow
                  key={rule.id}
                  left={<Icon className="h-4 w-4 text-violet-400" />}
                  middle={
                    <>
                      <p className="truncate text-xs font-medium text-foreground">{rule.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {rule.trigger}
                        {rule.condition ? ` · if ${rule.condition}` : ""} → {action?.type ?? "—"}
                        {!TRIGGER_WIRED[rule.trigger] && (
                          <span className="text-amber-600"> · {t("automationNotWired", "not fired yet")}</span>
                        )}
                      </p>
                    </>
                  }
                  right={
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => toggleRule(rule.id, v)}
                        aria-label={t("automationToggle", "Enable/disable rule")}
                      />
                      <button
                        type="button"
                        onClick={() => deleteRule(rule.id)}
                        className="text-muted-foreground/60 hover:text-rose-400"
                        aria-label={t("delete", "Delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Runs ──────────────────────────────────────────────── */}
      <SectionCard
        title={t("automationRuns", "Run History")}
        icon={Play}
        iconClass="text-cyan-400"
        action={
          <button
            type="button"
            onClick={refresh}
            className="text-[10.5px] font-medium text-primary hover:underline"
          >
            {t("refresh", "Refresh")}
          </button>
        }
      >
        {runsLoading ? (
          <LoadingRows count={3} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Play}
            message={t("automationNoRuns", "No runs yet")}
            sub={t("automationNoRunsSub", "Runs appear here when a trigger fires and matches an enabled rule.")}
          />
        ) : (
          <div className="space-y-1.5">
            {runs.map((run) => {
              const failedAction = run.actions.find((a) => a.status === "failed");
              return (
                <FeedRow
                  key={run.id}
                  dot={runDot(run.status)}
                  middle={
                    <>
                      <p className="truncate text-xs text-foreground">{run.ruleName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {run.trigger}
                        {failedAction?.error ? ` · ${failedAction.error}` : ""}
                      </p>
                    </>
                  }
                  right={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-medium capitalize text-muted-foreground">
                        {run.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatTime(run.startedAt)}
                      </span>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Test helper: fire a sample ocr.completed event ─────── */}
      <SectionCard title={t("automationTest", "Test")} icon={Play} iconClass="text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {t(
              "automationTestHint",
              "Fire a sample ocr.completed event to verify your enabled rules run.",
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fireTrigger("ocr.completed", {
                documentId: "test-doc",
                itemCount: 3,
                warnings: ["test warning"],
              });
              setTimeout(refresh, 400);
            }}
          >
            {t("automationFireTest", "Fire test event")}
          </Button>
        </div>
      </SectionCard>
    </DashboardShell>
  );
}
