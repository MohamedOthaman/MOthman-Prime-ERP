import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import {
  Loader2,
  Users,
  RotateCcw,
  Save,
  Search,
  UserPlus,
  Shield,
  Building2,
  Eye,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import { getAppUrl } from "@/config/appUrl";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";

// ─── Role & Department Config ────────────────────────────────────────────────

const ALL_ROLES = [
  { value: "admin", label: "Admin", tier: "admin", dept: "operations" },
  { value: "ceo", label: "CEO", tier: "executive", dept: "executive" },
  { value: "gm", label: "GM", tier: "executive", dept: "executive" },
  { value: "ops_manager", label: "Operations Manager", tier: "admin", dept: "operations" },
  { value: "sales_manager", label: "Sales Manager", tier: "manager", dept: "sales" },
  { value: "salesman", label: "Salesman", tier: "user", dept: "sales" },
  { value: "purchase_manager", label: "Purchase Manager", tier: "manager", dept: "purchasing" },
  { value: "brand_manager", label: "Brand Manager", tier: "manager", dept: "marketing" },
  { value: "accountant", label: "Accountant", tier: "user", dept: "finance" },
  { value: "hr", label: "HR", tier: "user", dept: "hr" },
  { value: "invoice_team", label: "Invoice Team", tier: "user", dept: "invoicing" },
  { value: "inventory_controller", label: "Inventory Controller", tier: "manager", dept: "warehouse" },
  { value: "warehouse", label: "Warehouse", tier: "user", dept: "warehouse" },
  { value: "warehouse_manager", label: "Warehouse Manager", tier: "manager", dept: "warehouse" },
  { value: "cashier", label: "Cashier", tier: "user", dept: "finance" },
  { value: "secretary", label: "Secretary", tier: "user", dept: "general" },
  { value: "qc", label: "QC", tier: "user", dept: "warehouse" },
  { value: "read_only", label: "Read Only", tier: "user", dept: "general" },
] as const;

function getRoleInfo(role: string) {
  const found = ALL_ROLES.find((r) => r.value === role);
  return {
    label: found?.label ?? role,
    tier: found?.tier ?? "user",
    dept: found?.dept ?? "general",
  };
}

const TIER_BADGE: Record<string, string> = {
  executive: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  manager: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  user: "bg-muted text-muted-foreground border-border",
};

const DEPT_COLORS: Record<string, string> = {
  executive: "text-amber-400",
  operations: "text-blue-400",
  sales: "text-emerald-400",
  warehouse: "text-cyan-400",
  finance: "text-orange-400",
  purchasing: "text-violet-400",
  invoicing: "text-pink-400",
  marketing: "text-rose-400",
  hr: "text-teal-400",
  general: "text-muted-foreground",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string | null;
  is_active: boolean;
};

type EditedFields = {
  full_name?: string;
  role?: string;
  is_active?: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { t } = useLang();
  const { isOwner, isAdmin: canManage } = usePermissions();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedUsers, setEditedUsers] = useState<Record<string, EditedFields>>({});
  const [resetState, setResetState] = useState<Record<string, "idle" | "sending">>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // ── Load profiles ────────────────────────────────────────────────────────

  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at, is_active")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load profiles:", error);
        toast.error("Failed to load users");
        setProfiles([]);
        setLoading(false);
        return;
      }

      const rows: ProfileRow[] = (data ?? []).map((row: any) => ({
        id: row.id,
        full_name: row.full_name ?? "",
        email: row.email ?? "",
        role: row.role ?? "read_only",
        created_at: row.created_at ?? null,
        is_active: row.is_active ?? true,
      }));

      setProfiles(rows);
      setEditedUsers({});
      setLoading(false);
    };

    void loadProfiles();
  }, []);

  // ── Statistics ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = profiles.length;
    const active = profiles.filter((p) => p.is_active).length;
    const inactive = total - active;

    const byTier: Record<string, number> = {};
    const byDept: Record<string, number> = {};

    profiles.forEach((p) => {
      const info = getRoleInfo(p.role);
      byTier[info.tier] = (byTier[info.tier] ?? 0) + 1;
      byDept[info.dept] = (byDept[info.dept] ?? 0) + 1;
    });

    return { total, active, inactive, byTier, byDept };
  }, [profiles]);

  // ── Value helpers ────────────────────────────────────────────────────────

  const getVal = (profile: ProfileRow, field: keyof EditedFields) => {
    const edited = editedUsers[profile.id];
    if (edited && field in edited) return edited[field];
    if (field === "full_name") return profile.full_name ?? "";
    if (field === "role") return profile.role;
    if (field === "is_active") return profile.is_active;
    return undefined;
  };

  const setField = (userId: string, field: keyof EditedFields, value: any) => {
    setEditedUsers((prev) => {
      const current = prev[userId] ?? {};
      const profile = profiles.find((p) => p.id === userId);
      if (!profile) return prev;

      let originalVal: any;
      if (field === "full_name") originalVal = profile.full_name ?? "";
      else if (field === "role") originalVal = profile.role;
      else if (field === "is_active") originalVal = profile.is_active;

      const updated = { ...current, [field]: value };

      if (value === originalVal) {
        delete updated[field];
      }

      if (Object.keys(updated).length === 0) {
        const { [userId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [userId]: updated };
    });
  };

  const changedCount = Object.keys(editedUsers).length;
  const hasChanges = changedCount > 0;

  // ── Save handler ─────────────────────────────────────────────────────────

  const handleSaveAll = async () => {
    if (!hasChanges) return;
    setSaving(true);

    const entries = Object.entries(editedUsers);
    let successCount = 0;
    let errorCount = 0;

    for (const [userId, fields] of entries) {
      const updatePayload: Record<string, any> = {};
      if ("full_name" in fields) updatePayload.full_name = (fields.full_name ?? "").trim();
      if ("role" in fields) updatePayload.role = fields.role;
      if ("is_active" in fields) updatePayload.is_active = fields.is_active;

      if (Object.keys(updatePayload).length === 0) continue;

      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (error) {
        console.error(`Failed to save user ${userId}:`, error);
        errorCount++;
      } else {
        successCount++;
        const profile = profiles.find((p) => p.id === userId);
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === userId ? { ...p, ...updatePayload } : p
          )
        );

        // Audit log — fire and forget
        if ("role" in fields && profile) {
          void logAudit({
            entityType: "user",
            entityId: userId,
            action: "role_changed",
            oldValue: { role: profile.role },
            newValue: { role: fields.role },
            metadata: { user_email: profile.email },
          });
        }
        if ("is_active" in fields && profile) {
          void logAudit({
            entityType: "user",
            entityId: userId,
            action: fields.is_active ? "activated" : "deactivated",
            oldValue: { is_active: profile.is_active },
            newValue: { is_active: fields.is_active },
            metadata: { user_email: profile.email },
          });
        }
      }
    }

    if (errorCount === 0) {
      setEditedUsers({});
      toast.success(`${successCount} user(s) saved successfully`);
    } else {
      toast.error(`${errorCount} user(s) failed to save`);
      if (successCount > 0) {
        toast.success(`${successCount} user(s) saved`);
      }
    }

    setSaving(false);
  };

  // ── Reset password ───────────────────────────────────────────────────────

  const handleResetPassword = async (profile: ProfileRow) => {
    const email = profile.email?.trim();
    if (!email) {
      toast.error("No email address for this user");
      return;
    }

    setResetState((prev) => ({ ...prev, [profile.id]: "sending" }));

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/reset-password`,
    });

    if (error) {
      console.error("Failed to send reset email:", error);
      toast.error(`Reset failed: ${error.message}`);
    } else {
      toast.success(`Reset email sent to ${email}`);
      void logAudit({
        entityType: "user",
        entityId: profile.id,
        action: "password_reset",
        metadata: { user_email: email },
      });
    }

    setResetState((prev) => ({ ...prev, [profile.id]: "idle" }));
  };

  // ── Filters ──────────────────────────────────────────────────────────────

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const value = search.toLowerCase().trim();
      const info = getRoleInfo(profile.role);

      const matchesSearch =
        value === "" ||
        (profile.full_name ?? "").toLowerCase().includes(value) ||
        (profile.email ?? "").toLowerCase().includes(value) ||
        profile.role.toLowerCase().includes(value);

      const matchesRole =
        roleFilter === "all" || profile.role === roleFilter;

      const matchesDept =
        deptFilter === "all" || info.dept === deptFilter;

      return matchesSearch && matchesRole && matchesDept;
    });
  }, [profiles, search, roleFilter, deptFilter]);

  // ── Format ───────────────────────────────────────────────────────────────

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB");
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">
            {t("userManagement")}
          </h1>
          <span className="ml-1 text-xs text-muted-foreground">
            {filteredProfiles.length} / {profiles.length} {t("users")}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-amber-500 font-medium">
                {changedCount} {t("modified")}
              </span>
            )}
            <button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? t("saving") : t("saveAll")}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* ── Statistics Panel ────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5">
            <Users className="w-5 h-5 text-blue-400 mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
            <Users className="w-5 h-5 text-emerald-400 mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5">
            <Users className="w-5 h-5 text-red-400 mb-1" />
            <p className="text-xl font-bold text-foreground">{stats.inactive}</p>
            <p className="text-xs text-muted-foreground">Inactive</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3.5">
            <Shield className="w-5 h-5 text-violet-400 mb-1" />
            <p className="text-xl font-bold text-foreground">
              {Object.keys(stats.byTier).length}
            </p>
            <p className="text-xs text-muted-foreground">Role Tiers</p>
          </div>
        </div>

        {/* ── Role breakdown (compact) ───────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(stats.byTier)
            .sort(([, a], [, b]) => b - a)
            .map(([tier, count]) => (
              <div
                key={tier}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${TIER_BADGE[tier] ?? TIER_BADGE.user}`}
              >
                <span className="text-xs font-medium capitalize">{tier}</span>
                <span className="ml-auto text-xs font-mono">{count}</span>
              </div>
            ))}
        </div>

        {/* ── Filters ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full md:w-[180px] bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">{t("allRoles")}</option>
            {ALL_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full md:w-[160px] bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Departments</option>
            {[...new Set(ALL_ROLES.map((r) => r.dept))].sort().map((dept) => (
              <option key={dept} value={dept}>
                {dept.charAt(0).toUpperCase() + dept.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* ── Future placeholders ─────────────────────────────── */}
        {isOwner && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
              title="Coming in a future release"
            >
              <Eye className="w-3.5 h-3.5" />
              View as User
              <span className="text-[9px] bg-muted rounded px-1 py-0.5 ml-1">Soon</span>
            </button>
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
              title="Coming in a future release"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Visual Builder
              <span className="text-[9px] bg-muted rounded px-1 py-0.5 ml-1">Soon</span>
            </button>
          </div>
        )}

        {/* ── Users Table ────────────────────────────────────── */}
        {filteredProfiles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("noUsersFound")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-xl bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">#</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableName")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableEmail")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableRole")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">Tier</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">Dept</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableStatus")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableReset")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableJoined")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredProfiles.map((profile, index) => {
                  const resetLoading = resetState[profile.id] === "sending";
                  const isActive = getVal(profile, "is_active") as boolean;
                  const isEdited = profile.id in editedUsers;
                  const effectiveRole = (getVal(profile, "role") as string) ?? profile.role;
                  const roleInfo = getRoleInfo(effectiveRole);

                  return (
                    <tr
                      key={profile.id}
                      className={`border-t border-border hover:bg-muted/20 transition ${
                        isEdited ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {/* Index */}
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                        {index + 1}
                      </td>

                      {/* Name - editable */}
                      <td className="px-3 py-1.5 min-w-[180px]">
                        <input
                          type="text"
                          value={(getVal(profile, "full_name") as string) ?? ""}
                          onChange={(e) => setField(profile.id, "full_name", e.target.value)}
                          disabled={saving}
                          className="w-full bg-transparent border border-transparent rounded px-2 py-1 text-sm text-foreground focus:bg-background focus:border-border focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>

                      {/* Email */}
                      <td className="px-3 py-1.5 min-w-[200px] text-muted-foreground text-xs break-all">
                        {profile.email || "-"}
                      </td>

                      {/* Role dropdown */}
                      <td className="px-3 py-1.5 min-w-[160px]">
                        <select
                          value={effectiveRole}
                          onChange={(e) => setField(profile.id, "role", e.target.value)}
                          disabled={saving}
                          className="w-full bg-transparent border border-transparent rounded px-2 py-1 text-sm text-foreground focus:bg-background focus:border-border focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {ALL_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Tier badge */}
                      <td className="px-3 py-1.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${TIER_BADGE[roleInfo.tier] ?? TIER_BADGE.user}`}>
                          {roleInfo.tier}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="px-3 py-1.5">
                        <span className={`flex items-center gap-1 text-xs font-medium capitalize ${DEPT_COLORS[roleInfo.dept] ?? DEPT_COLORS.general}`}>
                          <Building2 className="w-3 h-3" />
                          {roleInfo.dept}
                        </span>
                      </td>

                      {/* Active toggle */}
                      <td className="px-3 py-1.5 min-w-[100px]">
                        <button
                          type="button"
                          onClick={() => setField(profile.id, "is_active", !isActive)}
                          disabled={saving}
                          className={`rounded-full px-3 py-0.5 text-xs font-medium border transition-all duration-200 ${
                            isActive
                              ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25"
                              : "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                          }`}
                        >
                          {isActive ? t("active") : t("disabled")}
                        </button>
                      </td>

                      {/* Reset Password */}
                      <td className="px-3 py-1.5 min-w-[100px]">
                        <button
                          type="button"
                          onClick={() => handleResetPassword(profile)}
                          disabled={resetLoading || !profile.email}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {resetLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          {resetLoading ? t("sending") : t("resetBtn")}
                        </button>
                      </td>

                      {/* Joined */}
                      <td className="px-3 py-1.5 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(profile.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}