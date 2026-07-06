import { CloudOff, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { useLang } from "@/contexts/LanguageContext";

/**
 * Global sync state pill (bottom-right). Local-first contract: users must
 * always be able to tell whether their work is safely local-only, syncing,
 * or fully synced — without the state ever blocking them.
 *
 * Hidden entirely when online with an empty outbox (the common case).
 */
export function SyncStatusIndicator() {
  const { t } = useLang();
  const { pending, inFlight, failedPermanent } = useSyncStatus();
  const { isOnline, supabaseReachable } = useOfflineStatus();

  const offline = !isOnline || !supabaseReachable;
  const queued = pending + inFlight;

  if (!offline && queued === 0 && failedPermanent === 0) return null;

  let icon = <Check className="h-3.5 w-3.5" />;
  let text = t("syncAllSynced", "All changes synced");
  let cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";

  if (failedPermanent > 0) {
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    text = `${failedPermanent} ${t("syncFailed", "change(s) failed to sync")}`;
    cls = "border-red-500/30 bg-red-500/10 text-red-400";
  } else if (offline) {
    icon = <CloudOff className="h-3.5 w-3.5" />;
    text =
      queued > 0
        ? `${t("syncOffline", "Offline")} — ${queued} ${t("syncPendingChanges", "pending change(s)")}`
        : t("syncOfflineLocal", "Offline — working from local data");
    cls = "border-amber-500/30 bg-amber-500/10 text-amber-500";
  } else if (queued > 0) {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
    text = `${t("syncSyncing", "Syncing")} ${queued} ${t("syncPendingChanges", "pending change(s)")}`;
    cls = "border-sky-500/30 bg-sky-500/10 text-sky-500";
  }

  return (
    <div
      role="status"
      className={`fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-lg backdrop-blur-sm ${cls}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}
