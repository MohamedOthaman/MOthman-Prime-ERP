// src/pages/salesmen/SalesmanForm.tsx

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Save, Trash2, AlertTriangle } from "lucide-react";
import { useRole } from "@/features/reports/hooks/useRole";

interface SalesmanFormData {
    code: string;
    name: string;
    name_ar: string;
    phone: string;
    email: string;
    notes: string;
    is_active: boolean;
}

const EMPTY_FORM: SalesmanFormData = {
    code: "",
    name: "",
    name_ar: "",
    phone: "",
    email: "",
    notes: "",
    is_active: true,
};

export default function SalesmanForm() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { isAdmin } = useRole();
    const isEdit = Boolean(id && id !== "new");

    const [form, setForm] = useState<SalesmanFormData>(EMPTY_FORM);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (!isEdit) {
            setLoading(false);
            return;
        }

        async function load() {
            const { data, error: err } = await supabase
                .from("salesmen")
                .select("code, name, name_ar, phone, email, notes, is_active")
                .eq("id", id)
                .single();

            if (err || !data) {
                setError("Salesman not found.");
            } else {
                setForm({
                    code: data.code,
                    name: data.name,
                    name_ar: (data as any).name_ar ?? "",
                    phone: (data as any).phone ?? "",
                    email: (data as any).email ?? "",
                    notes: (data as any).notes ?? "",
                    is_active: data.is_active,
                });
            }
            setLoading(false);
        }

        load();
    }, [id, isEdit]);

    const set = (field: keyof SalesmanFormData, value: string | boolean) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
    };

    const handleSave = async () => {
        if (!form.code.trim()) {
            setError("Salesman code is required.");
            return;
        }
        if (!form.name.trim()) {
            setError("Salesman name is required.");
            return;
        }

        setSaving(true);
        setError(null);

        const payload = {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            name_ar: form.name_ar.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            notes: form.notes.trim() || null,
            is_active: form.is_active,
        };

        let err;
        if (isEdit) {
            ({ error: err } = await supabase
                .from("salesmen")
                .update(payload)
                .eq("id", id));
        } else {
            ({ error: err } = await supabase
                .from("salesmen")
                .insert(payload));
        }

        setSaving(false);

        if (err) {
            if (err.code === "23505") {
                setError("This salesman code already exists. Use a unique code.");
            } else {
                setError(err.message);
            }
        } else {
            navigate("/salesmen");
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        setDeleting(true);
        const { error: err } = await supabase
            .from("salesmen")
            .delete()
            .eq("id", id);

        setDeleting(false);

        if (err) {
            setError("Failed to delete. This salesman may have linked records.");
            setConfirmDelete(false);
        } else {
            navigate("/salesmen");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-20">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
                <div className="max-w-2xl mx-auto flex items-center gap-3">
                    <button
                        onClick={() => navigate("/salesmen")}
                        className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-foreground" />
                    </button>
                    <h1 className="text-lg font-bold text-foreground tracking-tight">
                        {isEdit ? "Edit Salesman" : "New Salesman"}
                    </h1>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save
                    </button>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
                {error && (
                    <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Salesman Information
                    </h2>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Code <span className="text-destructive">*</span>
                        </label>
                        <input
                            value={form.code}
                            onChange={(e) => set("code", e.target.value.toUpperCase())}
                            placeholder="e.g. MT, AA, JL"
                            maxLength={10}
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono uppercase placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Must match the code used in customer assignment.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Full Name <span className="text-destructive">*</span>
                        </label>
                        <input
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                            placeholder="e.g. Manu Varghese"
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Arabic Name
                        </label>
                        <input
                            value={form.name_ar}
                            onChange={(e) => set("name_ar", e.target.value)}
                            placeholder="الاسم بالعربي"
                            dir="rtl"
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Phone
                            </label>
                            <input
                                value={form.phone}
                                onChange={(e) => set("phone", e.target.value)}
                                placeholder="+965 XXXX XXXX"
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Email
                            </label>
                            <input
                                value={form.email}
                                onChange={(e) => set("email", e.target.value)}
                                placeholder="salesman@company.com"
                                type="email"
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Notes
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => set("notes", e.target.value)}
                            rows={3}
                            placeholder="Notes about this salesman..."
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                    </div>

                    {isEdit && (
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => set("is_active", e.target.checked)}
                                className="rounded border-border w-4 h-4"
                            />
                            <div>
                                <span className="text-sm text-foreground">Active</span>
                                <p className="text-xs text-muted-foreground">
                                    Inactive salesmen are hidden from customer assignment dropdowns.
                                </p>
                            </div>
                        </label>
                    )}
                </section>

                {isEdit && isAdmin && (
                    <section className="border-t border-border pt-6">
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                            Danger Zone
                        </h2>
                        {confirmDelete ? (
                            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
                                <p className="text-sm text-destructive font-medium">
                                    Are you sure? This cannot be undone.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    If this salesman is assigned to customers, those customer records will lose their salesman assignment.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-sm px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
                                    >
                                        {deleting ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        Delete permanently
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="text-sm px-4 py-2 rounded-md bg-secondary text-foreground hover:opacity-80"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleDelete}
                                className="flex items-center gap-1.5 text-sm text-destructive hover:opacity-80 transition-opacity"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete salesman
                            </button>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}