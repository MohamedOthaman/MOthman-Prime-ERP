/**
 * GRN / Receiving Workflow Configuration
 *
 * Single source of truth for:
 * - Status definitions and labels
 * - Status badge styling
 * - Workflow transitions (who can move to what)
 * - Stock eligibility rules
 *
 * Business rule: ONLY "approved" status creates inventory IN transactions.
 * Municipality/health approval is required BEFORE stock entry.
 */

import type { RoleTier } from "@/types/roles";

// ─── Status Types ────────────────────────────────────────────────────────────

export type GRNWorkflowStatus =
  | "draft"
  | "received"
  | "inspected"
  | "municipality_pending"
  | "approved"
  | "partial_hold"
  | "completed"
  | "rejected";

/**
 * Master list of valid statuses — mirrors the DB CHECK constraint.
 * Use this instead of hardcoding status strings anywhere.
 */
export const VALID_STATUSES: readonly GRNWorkflowStatus[] = [
  "draft",
  "received",
  "inspected",
  "municipality_pending",
  "approved",
  "partial_hold",
  "completed",
  "rejected",
] as const;

// ─── Status Configuration ────────────────────────────────────────────────────

export interface StatusConfig {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  dotColor: string;
  /** Whether this status allows editing the GRN data */
  editable: boolean;
  /** Whether items in this status can enter stock */
  stockEligible: boolean;
  /** Step number in the workflow (for stepper UI) */
  step: number;
}

export const WORKFLOW_STATUSES: Record<GRNWorkflowStatus, StatusConfig> = {
  draft: {
    label: "Draft",
    shortLabel: "Draft",
    description: "GRN created, awaiting receiving confirmation",
    badgeClass: "border-amber-500/25 bg-amber-500/10 text-amber-500",
    dotColor: "bg-amber-400",
    editable: true,
    stockEligible: false,
    step: 1,
  },
  received: {
    label: "Received",
    shortLabel: "Received",
    description: "Goods physically received, awaiting QC inspection",
    badgeClass: "border-blue-500/25 bg-blue-500/10 text-blue-500",
    dotColor: "bg-blue-400",
    editable: true,
    stockEligible: false,
    step: 2,
  },
  inspected: {
    label: "Inspected",
    shortLabel: "QC Done",
    description: "QC inspection complete, awaiting municipality approval",
    badgeClass: "border-violet-500/25 bg-violet-500/10 text-violet-500",
    dotColor: "bg-violet-400",
    editable: false,
    stockEligible: false,
    step: 3,
  },
  municipality_pending: {
    label: "Municipality Pending",
    shortLabel: "Muni.",
    description: "Submitted for municipality/health authority approval",
    badgeClass: "border-orange-500/25 bg-orange-500/10 text-orange-500",
    dotColor: "bg-orange-400",
    editable: false,
    stockEligible: false,
    step: 4,
  },
  approved: {
    label: "Approved",
    shortLabel: "Approved",
    description: "Municipality approved — ready to post to inventory",
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
    dotColor: "bg-emerald-400",
    editable: false,
    stockEligible: true,
    step: 5,
  },
  partial_hold: {
    label: "Partial Hold",
    shortLabel: "Part. Hold",
    description: "Some lines approved, some held — partial inventory posting",
    badgeClass: "border-orange-500/25 bg-orange-500/10 text-orange-500",
    dotColor: "bg-orange-400",
    editable: false,
    stockEligible: true,
    step: 5,
  },
  completed: {
    label: "Completed",
    shortLabel: "Done",
    description: "Posted to inventory — batches created, stock available",
    badgeClass: "border-teal-500/25 bg-teal-500/10 text-teal-500",
    dotColor: "bg-teal-400",
    editable: false,
    stockEligible: true,
    step: 6,
  },
  rejected: {
    label: "Rejected",
    shortLabel: "Rejected",
    description: "GRN rejected — items do NOT enter stock",
    badgeClass: "border-red-500/25 bg-red-500/10 text-red-500",
    dotColor: "bg-red-400",
    editable: false,
    stockEligible: false,
    step: -1,
  },
};

// ─── Status order for the stepper (excludes rejected) ────────────────────────

export const WORKFLOW_STEPS: GRNWorkflowStatus[] = [
  "draft",
  "received",
  "inspected",
  "municipality_pending",
  "approved",
  "completed",
];

// ─── Transition Rules ────────────────────────────────────────────────────────

export interface TransitionRule {
  from: GRNWorkflowStatus;
  to: GRNWorkflowStatus;
  /** Minimum tier required to perform this transition */
  minTier: RoleTier;
  /** Specific roles that can also perform this (in addition to minTier) */
  allowedRoles?: string[];
  /** Button label shown in the UI */
  actionLabel: string;
  /** Whether this is a "danger" action (uses red styling) */
  danger?: boolean;
}

/**
 * Workflow transition rules.
 *
 * The rules enforce:
 * - warehouse/user can: draft → received
 * - qc/manager can: received → inspected
 * - admin+ can: inspected → municipality_pending
 * - admin+ can: municipality_pending → approved (creates stock)
 * - admin+ can: any non-approved → rejected
 * - admin+ can: draft/received backward to draft (correction)
 */
export const TRANSITION_RULES: TransitionRule[] = [
  // Forward transitions
  {
    from: "draft",
    to: "received",
    minTier: "user",
    allowedRoles: ["warehouse", "warehouse_manager", "inventory_controller", "qc"],
    actionLabel: "Mark Received",
  },
  {
    from: "received",
    to: "inspected",
    minTier: "manager",
    allowedRoles: ["qc", "warehouse_manager", "inventory_controller"],
    actionLabel: "Mark Inspected",
  },
  {
    from: "inspected",
    to: "municipality_pending",
    minTier: "admin",
    actionLabel: "Submit to Municipality",
  },
  {
    from: "municipality_pending",
    to: "approved",
    minTier: "admin",
    actionLabel: "Approve (Post to Stock)",
  },

  // Rejection (from any non-terminal state)
  { from: "draft",                to: "rejected", minTier: "admin", actionLabel: "Reject", danger: true },
  { from: "received",             to: "rejected", minTier: "admin", actionLabel: "Reject", danger: true },
  { from: "inspected",            to: "rejected", minTier: "admin", actionLabel: "Reject", danger: true },
  { from: "municipality_pending", to: "rejected", minTier: "admin", actionLabel: "Reject", danger: true },
  { from: "approved",             to: "rejected", minTier: "admin", actionLabel: "Reject", danger: true },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

const TIER_LEVEL: Record<RoleTier, number> = {
  owner: 5,
  executive: 4,
  admin: 3,
  manager: 2,
  user: 1,
};

/**
 * Get the status config for a given status string.
 * Falls back to draft for unknown statuses (backward compat with "inspecting", "completed", etc.)
 */
export function getStatusConfig(status: string): StatusConfig {
  // Map legacy statuses
  if (status === "inspecting") return WORKFLOW_STATUSES.inspected;
  if (status === "cancelled")  return WORKFLOW_STATUSES.rejected;

  return WORKFLOW_STATUSES[status as GRNWorkflowStatus] ?? WORKFLOW_STATUSES.draft;
}

/**
 * Get available transitions for the current status, filtered by user's role and tier.
 */
export function getAvailableTransitions(
  currentStatus: string,
  userTier: RoleTier,
  userRole: string
): TransitionRule[] {
  const normalizedStatus = normalizeStatus(currentStatus);

  return TRANSITION_RULES.filter((rule) => {
    if (rule.from !== normalizedStatus) return false;

    // Check tier
    if (TIER_LEVEL[userTier] >= TIER_LEVEL[rule.minTier]) return true;

    // Check specific role allowance
    if (rule.allowedRoles?.includes(userRole)) return true;

    return false;
  });
}

/**
 * Normalize legacy status strings to the new workflow statuses.
 */
export function normalizeStatus(status: string): GRNWorkflowStatus {
  if (status === "inspecting") return "inspected";
  if (status === "cancelled")  return "rejected";

  if (status in WORKFLOW_STATUSES) return status as GRNWorkflowStatus;

  return "draft";
}

/**
 * Check if a status allows editing the GRN data.
 */
export function isEditable(status: string): boolean {
  return getStatusConfig(status).editable;
}

/**
 * Check if a status is stock-eligible (only "approved").
 */
export function isStockEligible(status: string): boolean {
  return getStatusConfig(status).stockEligible;
}
