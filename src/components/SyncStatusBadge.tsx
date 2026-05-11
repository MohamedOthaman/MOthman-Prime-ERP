import { CloudOff, Cloud, RefreshCw, AlertTriangle } from "lucide-react";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { useSyncStatus } from "@/sync/useSyncStatus";

export function SyncStatusBadge() {
  const offline = useOfflineStatus();
  const sync = useSyncStatus();
  const online = offline.isOnline && offline.supabaseReachable;
  const pendingTotal = sync.pending + sync.inFlight;

  if (online && pendingTotal === 0 && sync.failedPermanent === 0) {
    return null;
  }

  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-semibold"
        title="Offline — actions will sync when reconnected"
      >
        <CloudOff className="w-3 h-3" />
        Offline
        {pendingTotal > 0 ? ` · ${pendingTotal}` : ""}
      </span>
    );
  }

  if (sync.inFlight > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-semibold"
        title={`${sync.inFlight} syncing`}
      >
        <RefreshCw className="w-3 h-3 animate-spin" />
        Syncing · {sync.inFlight}
      </span>
    );
  }

  if (sync.pending > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-semibold"
        title={`${sync.pending} pending`}
      >
        <Cloud className="w-3 h-3" />
        {sync.pending} pending
      </span>
    );
  }

  if (sync.failedPermanent > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-semibold"
        title={`${sync.failedPermanent} failed — needs manual review`}
      >
        <AlertTriangle className="w-3 h-3" />
        {sync.failedPermanent} failed
      </span>
    );
  }

  return null;
}