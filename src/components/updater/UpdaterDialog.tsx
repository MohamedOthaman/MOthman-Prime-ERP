import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { UpdateInfo, DownloadProgress, UpdaterState } from "@/hooks/useAppUpdater";

interface UpdaterDialogProps {
  state: UpdaterState;
  onInstall: () => void;
  onDismiss: () => void;
  onRestart?: () => void;
}

const CHANNEL_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  stable:   { label: "Stable",   variant: "default" },
  beta:     { label: "Beta",     variant: "secondary" },
  internal: { label: "Internal", variant: "destructive" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return "";
  }
}

function ReleaseNotes({ markdown }: { markdown: string | null }) {
  if (!markdown) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No release notes provided.
      </p>
    );
  }

  // Simple markdown → HTML: bold, headers, list items, line breaks
  const html = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-base mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-base mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/\n/g, "<br/>");

  return (
    <div
      className="text-sm text-muted-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function AvailableView({
  info,
  onInstall,
  onDismiss,
  installing,
}: {
  info: UpdateInfo;
  onInstall: () => void;
  onDismiss: () => void;
  installing: boolean;
}) {
  const channelMeta = CHANNEL_LABELS[info.channel] ?? CHANNEL_LABELS.stable;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <DialogTitle>Update Available</DialogTitle>
          <Badge variant={channelMeta.variant} className="ml-auto text-xs">
            {channelMeta.label}
          </Badge>
        </div>
        <DialogDescription className="flex items-center gap-2 pt-1">
          <span className="font-mono font-medium text-foreground">
            v{info.version}
          </span>
          {info.date && (
            <span className="text-xs text-muted-foreground">
              · Released {formatDate(info.date)}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Release Notes
        </p>
        <ScrollArea className="h-48 rounded-md border bg-muted/30 px-4 py-3">
          <ReleaseNotes markdown={info.body} />
        </ScrollArea>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={installing}>
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Remind Later
        </Button>
        <Button size="sm" onClick={onInstall} disabled={installing}>
          {installing ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />
          )}
          {installing ? "Starting download…" : "Download & Install"}
        </Button>
      </DialogFooter>
    </>
  );
}

function DownloadingView({ progress }: { progress: DownloadProgress }) {
  const percent = progress.percent ?? 0;
  const isIndeterminate = progress.total === null;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="h-5 w-5 text-primary animate-bounce" />
          <DialogTitle>Downloading Update</DialogTitle>
        </div>
        <DialogDescription>
          Please keep the application open while the update downloads.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-3">
        <Progress
          value={isIndeterminate ? undefined : percent}
          className="h-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatBytes(progress.downloaded)} downloaded</span>
          {progress.total ? (
            <span>
              {Math.round(percent)}% of {formatBytes(progress.total)}
            </span>
          ) : (
            <span>Calculating…</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          The installer will launch automatically when ready.
        </p>
      </div>
    </>
  );
}

function ReadyView({ onRestart, onDismiss }: { onRestart?: () => void; onDismiss: () => void }) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <DialogTitle>Update Ready</DialogTitle>
        </div>
        <DialogDescription>
          The update has been installed. Restart the application to apply it.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Restart Later
        </Button>
        {onRestart && (
          <Button size="sm" onClick={onRestart}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Restart Now
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function ErrorView({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <X className="h-5 w-5 text-destructive" />
          <DialogTitle>Update Failed</DialogTitle>
        </div>
        <DialogDescription>
          The update could not be installed. Please try again later.
        </DialogDescription>
      </DialogHeader>

      <div className="py-3">
        <p className="text-xs text-muted-foreground font-mono bg-muted rounded p-2 break-all">
          {message}
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

export function UpdaterDialog({ state, onInstall, onDismiss, onRestart }: UpdaterDialogProps) {
  const [installing, setInstalling] = useState(false);

  const isOpen =
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "ready" ||
    state.status === "error";

  const handleInstall = async () => {
    setInstalling(true);
    await onInstall();
    setInstalling(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          // Prevent accidental dismissal while downloading
          if (state.status === "downloading") e.preventDefault();
        }}
      >
        {state.status === "available" && (
          <AvailableView
            info={state.info}
            onInstall={handleInstall}
            onDismiss={onDismiss}
            installing={installing}
          />
        )}
        {state.status === "downloading" && (
          <DownloadingView progress={state.progress} />
        )}
        {state.status === "ready" && (
          <ReadyView onRestart={onRestart} onDismiss={onDismiss} />
        )}
        {state.status === "error" && (
          <ErrorView message={state.message} onDismiss={onDismiss} />
        )}
      </DialogContent>
    </Dialog>
  );
}
