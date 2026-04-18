import type { UserRole, RoleTier, Department } from "@/types/roles";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MockKPI {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  color: "emerald" | "blue" | "amber" | "violet" | "rose";
}

export interface MockQuickAction {
  label: string;
  path: string;
  icon: string; // lucide icon name
  color: string;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tier: RoleTier;
  department: Department;
  avatarInitials: string;
  avatarColor: string;
  kpis: MockKPI[];
  quickActions: MockQuickAction[];
  accessDescription: string;
}

// ─── Mock Users (Real Business Personas) ─────────────────────────────────────

export const MOCK_USERS: MockUser[] = [
  // ── 👑 CEO ────────────────────────────────────────────────────────────────
  {
    id: "mock-ceo-001",
    name: "Mr. Mrawan",
    email: "ceo@foodchoice.com",
    role: "ceo",
    tier: "executive",
    department: "executive",
    avatarInitials: "MM",
    avatarColor: "bg-amber-500",
    accessDescription: "High-level KPIs, Financial Overview, No Operational Access",
    kpis: [
      {
        label: "Company Revenue (MTD)",
        value: "AED 1,245,000",
        trend: "up",
        trendValue: "+12.4%",
        color: "emerald",
      },
      {
        label: "Net Profit Margin",
        value: "22.5%",
        trend: "up",
        trendValue: "+1.2%",
        color: "blue",
      },
      {
        label: "Operating Costs",
        value: "AED 340,000",
        trend: "down",
        trendValue: "-4.5%",
        color: "rose",
      },
    ],
    quickActions: [
      { label: "Financial Reports", path: "/reports/sales", icon: "BarChart3", color: "violet" },
      { label: "Executive Overview", path: "/", icon: "LayoutDashboard", color: "amber" },
    ],
  },

  // ── 🧑‍💼 Operations Manager ─────────────────────────────────────────────────
  {
    id: "mock-ops-001",
    name: "Sarah Ahmed",
    email: "sarah.ahmed@foodchoice.com",
    role: "ops_manager",
    tier: "admin",
    department: "operations",
    avatarInitials: "SA",
    avatarColor: "bg-blue-500",
    accessDescription: "Monitors Sales & Stock, Heavy Reporting, Insights",
    kpis: [
      {
        label: "Weekly Sales",
        value: "AED 312,400",
        trend: "up",
        trendValue: "+8.2%",
        color: "emerald",
      },
      {
        label: "Pending Orders",
        value: "45",
        trend: "flat",
        trendValue: "0",
        color: "amber",
      },
      {
        label: "Stock Value",
        value: "AED 4.2M",
        trend: "up",
        trendValue: "+2.1%",
        color: "blue",
      },
    ],
    quickActions: [
      { label: "Sales Reports", path: "/reports/sales", icon: "BarChart3", color: "violet" },
      { label: "Stock Overview", path: "/stock", icon: "Package", color: "blue" },
      { label: "Invoice Validations", path: "/invoices", icon: "FileText", color: "emerald" },
    ],
  },

  // ── 🧪 QC Controller ───────────────────────────────────────────────────────
  {
    id: "mock-qc-001",
    name: "Ali",
    email: "ali.qc@foodchoice.com",
    role: "qc",
    tier: "user",
    department: "warehouse",
    avatarInitials: "A",
    avatarColor: "bg-teal-500",
    accessDescription: "GRN & Stock Inspection, Expiry & Damage Tracking",
    kpis: [
      {
        label: "Pending Inspections",
        value: "12",
        trend: "up",
        trendValue: "+3",
        color: "amber",
      },
      {
        label: "Damage Rate",
        value: "0.8%",
        trend: "down",
        trendValue: "-0.2%",
        color: "emerald",
      },
      {
        label: "Expiring Soon",
        value: "24 Items",
        trend: "up",
        trendValue: "+5",
        color: "rose",
      },
    ],
    quickActions: [
      { label: "GRN Inspection", path: "/grn", icon: "ClipboardList", color: "blue" },
      { label: "Expiry Alerts", path: "/reports/expiry", icon: "AlertTriangle", color: "rose" },
      { label: "Check Stock", path: "/stock", icon: "Package", color: "emerald" },
    ],
  },

  // ── 🧑‍💼 Sales Manager ──────────────────────────────────────────────────────
  {
    id: "mock-sales-mgr-001",
    name: "Ahmed Khaled",
    email: "ahmed.khaled@foodchoice.com",
    role: "sales_manager",
    tier: "manager",
    department: "sales",
    avatarInitials: "AK",
    avatarColor: "bg-violet-500",
    accessDescription: "Team Performance, Targets, Comparison Dashboards",
    kpis: [
      {
        label: "Team Sales (MTD)",
        value: "AED 845,000",
        trend: "up",
        trendValue: "+15.2%",
        color: "emerald",
      },
      {
        label: "Target Achievement",
        value: "92%",
        trend: "up",
        trendValue: "+5%",
        color: "blue",
      },
      {
        label: "Active Customers",
        value: "342",
        trend: "up",
        trendValue: "+12",
        color: "violet",
      },
    ],
    quickActions: [
      { label: "Team Performance", path: "/reports/sales", icon: "BarChart3", color: "violet" },
      { label: "Customers Setup", path: "/customers", icon: "Users", color: "blue" },
      { label: "Approve Invoices", path: "/invoices", icon: "FileText", color: "emerald" },
    ],
  },

  // ── 👨‍💻 Sales Representatives ───────────────────────────────────────────────
  
  // Sales Rep: Jalil
  {
    id: "mock-sales-001",
    name: "Jalil",
    email: "jalil.sales@foodchoice.com",
    role: "salesman",
    tier: "user",
    department: "sales",
    avatarInitials: "J",
    avatarColor: "bg-orange-500",
    accessDescription: "Create Invoices, Manage Clients, Track Targets",
    kpis: [
      { label: "My Sales (MTD)", value: "AED 125,000", trend: "up", trendValue: "+8%", color: "emerald" },
      { label: "My Target", value: "85%", trend: "up", trendValue: "+2%", color: "blue" },
      { label: "Invoices Created", value: "45", trend: "flat", trendValue: "0", color: "violet" },
    ],
    quickActions: [
      { label: "Create Invoice", path: "/invoice-entry", icon: "FileText", color: "blue" },
      { label: "My Customers", path: "/customers", icon: "Users", color: "violet" },
      { label: "Scan Product", path: "/invoice-scan", icon: "ScanLine", color: "amber" },
    ],
  },
  
  // Sales Rep: Mohsen
  {
    id: "mock-sales-002",
    name: "Mohsen",
    email: "mohsen.sales@foodchoice.com",
    role: "salesman",
    tier: "user",
    department: "sales",
    avatarInitials: "M",
    avatarColor: "bg-orange-500",
    accessDescription: "Create Invoices, Manage Clients, Track Targets",
    kpis: [
      { label: "My Sales (MTD)", value: "AED 140,200", trend: "up", trendValue: "+12%", color: "emerald" },
      { label: "My Target", value: "95%", trend: "up", trendValue: "+4%", color: "blue" },
      { label: "Invoices Created", value: "52", trend: "up", trendValue: "+3", color: "violet" },
    ],
    quickActions: [
      { label: "Create Invoice", path: "/invoice-entry", icon: "FileText", color: "blue" },
      { label: "My Customers", path: "/customers", icon: "Users", color: "violet" },
      { label: "Scan Product", path: "/invoice-scan", icon: "ScanLine", color: "amber" },
    ],
  },
  
  // Sales Rep: Noor
  {
    id: "mock-sales-003",
    name: "Noor",
    email: "noor.sales@foodchoice.com",
    role: "salesman",
    tier: "user",
    department: "sales",
    avatarInitials: "N",
    avatarColor: "bg-orange-500",
    accessDescription: "Create Invoices, Manage Clients, Track Targets",
    kpis: [
      { label: "My Sales (MTD)", value: "AED 115,000", trend: "down", trendValue: "-2%", color: "rose" },
      { label: "My Target", value: "75%", trend: "down", trendValue: "-5%", color: "amber" },
      { label: "Invoices Created", value: "38", trend: "flat", trendValue: "0", color: "violet" },
    ],
    quickActions: [
      { label: "Create Invoice", path: "/invoice-entry", icon: "FileText", color: "blue" },
      { label: "My Customers", path: "/customers", icon: "Users", color: "violet" },
      { label: "Scan Product", path: "/invoice-scan", icon: "ScanLine", color: "amber" },
    ],
  },
  
  // Sales Rep: Mohamed
  {
    id: "mock-sales-004",
    name: "Mohamed",
    email: "mohamed.sales@foodchoice.com",
    role: "salesman",
    tier: "user",
    department: "sales",
    avatarInitials: "M",
    avatarColor: "bg-orange-500",
    accessDescription: "Create Invoices, Manage Clients, Track Targets",
    kpis: [
      { label: "My Sales (MTD)", value: "AED 180,500", trend: "up", trendValue: "+20%", color: "emerald" },
      { label: "My Target", value: "115%", trend: "up", trendValue: "+10%", color: "blue" },
      { label: "Invoices Created", value: "70", trend: "up", trendValue: "+8", color: "violet" },
    ],
    quickActions: [
      { label: "Create Invoice", path: "/invoice-entry", icon: "FileText", color: "blue" },
      { label: "My Customers", path: "/customers", icon: "Users", color: "violet" },
      { label: "Scan Product", path: "/invoice-scan", icon: "ScanLine", color: "amber" },
    ],
  },
  
  // Sales Rep: Barni
  {
    id: "mock-sales-005",
    name: "Barni",
    email: "barni.sales@foodchoice.com",
    role: "salesman",
    tier: "user",
    department: "sales",
    avatarInitials: "B",
    avatarColor: "bg-orange-500",
    accessDescription: "Create Invoices, Manage Clients, Track Targets",
    kpis: [
      { label: "My Sales (MTD)", value: "AED 95,000", trend: "up", trendValue: "+4%", color: "emerald" },
      { label: "My Target", value: "65%", trend: "flat", trendValue: "0%", color: "amber" },
      { label: "Invoices Created", value: "32", trend: "down", trendValue: "-2", color: "violet" },
    ],
    quickActions: [
      { label: "Create Invoice", path: "/invoice-entry", icon: "FileText", color: "blue" },
      { label: "My Customers", path: "/customers", icon: "Users", color: "violet" },
      { label: "Scan Product", path: "/invoice-scan", icon: "ScanLine", color: "amber" },
    ],
  },

];

/**
 * Look up a mock user by role string.
 * Returns undefined if no mock matches.
 */
export function getMockUserByRole(role: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.role === role);
}

/**
 * Look up a mock user by email.
 */
export function getMockUserByEmail(email: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.email === email);
}
