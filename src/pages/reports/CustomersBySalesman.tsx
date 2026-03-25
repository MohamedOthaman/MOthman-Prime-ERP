// src/pages/reports/CustomersBySalesman.tsx
//
// REFACTORED: All Supabase logic moved to reportService.
// This component only handles rendering.
// UI style matches the existing Reports.tsx design system exactly.

import { useState } from "react";
import {
    Loader2,
    RefreshCw,
    AlertTriangle,
    Users,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { useReport } from "@/features/reports/hooks/useReport";
import { getCustomersBySalesman } from "@/features/services/reportService";
import type { CustomersBySalesmanGroup } from "@/features/reports/types";

export default function CustomersBySalesman() {
    const { data, loading, error, reload } =
        useReport<CustomersBySalesmanGroup[]>(getCustomersBySalesman);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggle = (code: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
        });
    };

    const expandAll = () => {
        if (!data) return;
        setExpanded(new Set(data.map((g) => g.salesman.code)));
    };

    const collapseAll = () => setExpanded(new Set());

    const totalCustomers =
        data?.reduce((sum, g) => sum + g.customers.length, 0) ?? 0;

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
                <Users className="w-9 h-9 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                    No customers with assigned salesmen found.
                </p>
                <p className="text-xs text-muted-foreground">
                    Assign salesmen to customers to see this report.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-semibold">{data.length}</span>{" "}
                    salesmen ·{" "}
                    <span className="text-foreground font-semibold">{totalCustomers}</span>{" "}
                    customers
                </p>

                <div className="flex items-center gap-2">
                    <button
                        onClick={expandAll}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Expand all
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                        onClick={collapseAll}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Collapse all
                    </button>
                    <button
                        onClick={reload}
                        className="ml-1 p-1.5 rounded-md hover:bg-secondary transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {data.map((group) => {
                const isOpen = expanded.has(group.salesman.code);

                return (
                    <div
                        key={group.salesman.code}
                        className="bg-card border border-border rounded-lg overflow-hidden"
                    >
                        <button
                            onClick={() => toggle(group.salesman.code)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-muted hover:bg-muted/80 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                {isOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                    {group.salesman.code}
                                </span>
                                <span className="text-sm font-semibold text-foreground">
                                    {group.salesman.name}
                                </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                                {group.customers.length}{" "}
                                {group.customers.length === 1 ? "customer" : "customers"}
                            </span>
                        </button>

                        {isOpen && (
                            <div>
                                {group.customers.map((customer, idx) => (
                                    <div
                                        key={customer.id}
                                        className={`px-3 py-2 flex items-center justify-between gap-2 ${idx < group.customers.length - 1
                                            ? "border-b border-border/50"
                                            : ""
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
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}