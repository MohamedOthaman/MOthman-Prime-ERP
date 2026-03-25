import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
  BarChart3,
  AlertTriangle,
  TrendingUp,
  History,
  Building2,
  Settings,
  FileText,
  RotateCcw,
  Download,
  ArrowUpDown,
  Filter,
  FileSpreadsheet,
  File,
  CalendarIcon,
  Users,
  ChevronRight,
} from "lucide-react";

export default function Reports() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "inventory", label: "Inventory", icon: Building2 },
    { key: "movements", label: "Movements", icon: History },
    { key: "alerts", label: "Alerts", icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-medium text-foreground">Reports</h1>
          </div>

          <p className="text-sm text-muted-foreground mt-1">
            Access operational and management reports.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap px-2 ${tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
                }`}
            >
              <t.icon className="w-3.5 h-3.5 inline mr-1" />
              {t.label}
            </button>
          ))}
        </div>

        {/* 🔥 Management Reports (NEW SECTION) */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Management Reports
            </h2>
          </div>

          <div className="space-y-3">
            {/* Customers by Salesman */}
            <button
              type="button"
              onClick={() => navigate("/reports/customers-by-salesman")}
              className="w-full text-left rounded-lg border border-border bg-secondary p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Customers by Salesman
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    View each salesman with assigned customers and active status.
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>

            {/* 🔥 جاهز للخطوة الجاية */}
            <button
              type="button"
              onClick={() => navigate("/reports/customers-without-salesman")}
              className="w-full text-left rounded-lg border border-border bg-secondary p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Customers Without Salesman
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Identify customers not assigned to any salesman.
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          </div>
        </div>

        {/* Existing content placeholder */}
        <div className="text-sm text-muted-foreground text-center py-10">
          Select a tab or use the management reports above.
        </div>
      </main>
    </div>
  );
}