import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

const ACCEPTED = ".pdf,.xlsx,.xls,.csv";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function DragDropZone({ onFiles, disabled }: Props) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter(isSupportedFile);
    if (files.length) onFiles(files);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">
          {t("dragDropOrClick", "Drag & drop files here, or click to browse")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dragDropSupported", "PDF, Excel (.xlsx, .xls), CSV — multiple files supported")}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}

function isSupportedFile(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "xlsx", "xls", "csv"].includes(ext);
}
