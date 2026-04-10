import { Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReportsMenuProps {
  onExportExcel: () => void;
  onExportPdf: () => void;
}

export function ReportsMenu({ onExportExcel, onExportPdf }: ReportsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary/80"
        >
          <Download className="h-3.5 w-3.5 text-primary" />
          Export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_14px_32px_rgba(0,0,0,0.2)]"
      >
        <DropdownMenuItem
          onClick={onExportExcel}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm text-popover-foreground focus:bg-secondary focus:text-foreground"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onExportPdf}
          className="gap-2 rounded-lg px-2.5 py-2 text-sm text-popover-foreground focus:bg-secondary focus:text-foreground"
        >
          <FileText className="h-4 w-4 text-destructive" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
