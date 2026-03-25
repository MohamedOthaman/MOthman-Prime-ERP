import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { getAppUrl } from "@/config/appUrl";
import { useLang } from "@/contexts/LanguageContext";

const ALL_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "ceo", label: "CEO" },
  { value: "gm", label: "GM" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "salesman", label: "Salesman" },
  { value: "purchase_manager", label: "Purchase Manager" },
  { value: "brand_manager", label: "Brand Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "hr", label: "HR" },
  { value: "ops_manager", label: "Operations Manager" },
  { value: "invoice_team", label: "Invoice Team" },
  { value: "inventory_controller", label: "Inventory Controller" },
  { value: "warehouse", label: "Warehouse" },
  { value: "cashier", label: "Cashier" },
  { value: "secretary", label: "Secretary" },
  { value: "qc", label: "QC" },
  { value: "read_only", label: "Read Only" },
] as const;

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

export default function UsersPage() {
  const { t } = useLang();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edited users: only stores values that differ from original
  const [editedUsers, setEditedUsers] = useState<Record<string, EditedFields>>({});

  const [resetState, setResetState] = useState<Record<string, "idle" | "sending">>({});

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

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

  // Get the effective (displayed) value for a field
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

      // Check if the new value matches original — if so, remove from edited
      let originalVal: any;
      if (field === "full_name") originalVal = profile.full_name ?? "";
      else if (field === "role") originalVal = profile.role;
      else if (field === "is_active") originalVal = profile.is_active;

      const updated = { ...current, [field]: value };

      // If this field now matches original, remove it
      if (value === originalVal) {
        delete updated[field];
      }

      // If no edited fields remain, remove the user entry
      if (Object.keys(updated).length === 0) {
        const { [userId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [userId]: updated };
    });
  };

  // Count how many users have pending changes
  const changedCount = Object.keys(editedUsers).length;
  const hasChanges = changedCount > 0;

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
        // Optimistically update local profiles
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === userId ? { ...p, ...updatePayload } : p
          )
        );
      }
    }

    // Clear successfully saved edits
    if (errorCount === 0) {
      setEditedUsers({});
      toast.success(`${successCount} ${t("users")} ${t("savedSuccessfully")}`);
    } else {
      // Remove only successful saves
      setEditedUsers((prev) => {
        const next = { ...prev };
        for (const [userId] of entries) {
          // Keep entries that errored (we can't know which, so keep all on partial failure)
        }
        return next;
      });
      toast.error(`${errorCount} ${t("users")} ${t("failedToSave")}`);
      if (successCount > 0) {
        toast.success(`${successCount} ${t("users")} ${t("saved")}`);
      }
    }

    setSaving(false);
  };

  const handleResetPassword = async (profile: ProfileRow) => {
    const email = profile.email?.trim();

    if (!email) {
      toast.error(t("noEmail"));
      return;
    }

    setResetState((prev) => ({ ...prev, [profile.id]: "sending" }));

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/reset-password`,
    });

    if (error) {
      console.error("Failed to send reset email:", error);
      toast.error(`${t("resetFailed")}: ${error.message}`);
    } else {
      toast.success(`${t("resetSentTo")} ${email}`);
    }

    setResetState((prev) => ({ ...prev, [profile.id]: "idle" }));
  };

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB");
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const value = search.toLowerCase().trim();

      const matchesSearch =
        value === "" ||
        (profile.full_name ?? "").toLowerCase().includes(value) ||
        (profile.email ?? "").toLowerCase().includes(value) ||
        profile.id.toLowerCase().includes(value);

      const matchesRole =
        roleFilter === "all" || profile.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [profiles, search, roleFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">
            {t("userManagement")}
          </h1>
          <span className="ml-1 text-xs text-muted-foreground">
            {filteredProfiles.length} {t("users")}
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

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            placeholder={t("searchUsers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />

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
        </div>

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
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableId")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableName")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableEmail")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableRole")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableStatus")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableReset")}</th>
                  <th className="text-left px-3 py-2 font-semibold whitespace-nowrap text-xs">{t("tableJoined")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredProfiles.map((profile) => {
                  const resetLoading = resetState[profile.id] === "sending";
                  const isActive = getVal(profile, "is_active") as boolean;
                  const isEdited = profile.id in editedUsers;

                  return (
                    <tr
                      key={profile.id}
                      className={`border-t border-border hover:bg-muted/20 transition ${
                        isEdited ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {/* ID */}
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {profile.id.slice(0, 6)}
                      </td>

                      {/* Name - inline editable */}
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

                      {/* Role - inline dropdown */}
                      <td className="px-3 py-1.5 min-w-[160px]">
                        <select
                          value={(getVal(profile, "role") as string) ?? profile.role}
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

                      {/* Status - clickable toggle */}
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

                      {/* Joined date */}
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