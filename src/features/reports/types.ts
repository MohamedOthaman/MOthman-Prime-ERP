// src/features/reports/types.ts

// ─────────────────────────────────────────────────────────────
// Core entities — match the customers table from Phase 2 Step 1
// ─────────────────────────────────────────────────────────────

export interface Salesman {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
}

export interface Customer {
    id: string;
    code: string;
    name: string;
    name_ar: string | null;
    type: string | null;
    group_name: string | null;
    area: string | null;
    credit_days: number;
    credit_limit: number;
    is_active: boolean;
    salesman_id: string | null;
    salesmen?: Salesman | null;
}

// ─────────────────────────────────────────────────────────────
// Report: Customers by Salesman
// ─────────────────────────────────────────────────────────────

/** Customers grouped under their salesman — ready for rendering */
export interface CustomersBySalesmanGroup {
    salesman: Salesman;
    customers: Customer[];
}

// ─────────────────────────────────────────────────────────────
// Report: Customers without Salesman
// ─────────────────────────────────────────────────────────────

export interface CustomersWithoutSalesmanRow {
    customer: Customer;
}

// ─────────────────────────────────────────────────────────────
// Generic report state — used inside useReport hook
// ─────────────────────────────────────────────────────────────

export interface ReportState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}
