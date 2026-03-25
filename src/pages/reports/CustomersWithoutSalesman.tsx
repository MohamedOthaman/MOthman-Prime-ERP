// src/pages/reports/CustomersWithoutSalesman.tsx
//
// REFACTORED: All Supabase logic moved to reportService.
// This component only handles rendering.
// UI style matches the existing Reports.tsx design system exactly.

import {
    Loader2,
    RefreshCw,
    AlertTriangle,
    UserX,
    CheckCircle,
} from "lucide-react";
import { useReport } from "@/features/reports/hooks/useReport";
import { getCustomersWithoutSalesman } from "@/features/services/reportService";
import type { CustomersWithoutSalesmanRow } from "@/features/reports/types";

export default function CustomersWithoutSalesman() {
    const { data, loading, error, reload } =
        useReport<CustomersWithoutSalesmanRow[]>(getCustomersWithoutSalesman);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading report...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <AlertTriangle className="w-7 h-7 text-destructive opacity-70" />
                <p className="text-sm text-destructive">{error}</p>
                <button
                    onClick={reload}
                    className="text-xs text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Try again
                </button>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <CheckCircle className="w-9 h-9 text-green-500 opacity-70" />
                <p className="text-sm font-semibold text-green-600">
                    All customers have a salesman assigned.
                </p>
                <p className="text-xs text-muted-foreground">
                    No unassigned customers found.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                    <span className="text-destructive font-semibold">{data.length}</span>{" "}
                    unassigned {data.length === 1 ? "customer" : "customers"}
                </p>
                <button
                    onClick={reload}
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <UserX className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground">
                    These customers have no assigned salesman. They will not appear
                    correctly in sales reports until assigned.
                </p>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted border-b border-border text-xs font-semibold text-foreground uppercase tracking-wide">
                    {data.length} {data.length === 1 ? "customer" : "customers"}
                </div>

                {data.map(({ customer }, idx) => (
                    <div
                        key={customer.id}
                        className={`px-3 py-2.5 flex items-center justify-between gap-2 ${idx < data.length - 1 ? "border-b border-border/50" : ""
                            }`}
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-primary shrink-0">
                                    {customer.code}
                                </span>
                                <span className="text-sm text-foreground truncate">
                                    {customer.name}
                                </span>
                            </div>
                            {customer.name_ar && (
                                <p
                                    className="text-xs text-muted-foreground mt-0.5 text-right"
                                    dir="rtl"
                                >
                                    {customer.name_ar}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {customer.type && (
                                <span className="text-xs bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                                    {customer.type}
                                </span>
                            )}
                            {customer.area && (
                                <span className="text-xs text-muted-foreground">
                                    {customer.area}
                                </span>
                            )}
                            <span className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5">
                                No SM
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}