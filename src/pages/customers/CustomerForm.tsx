// src/pages/customers/CustomerForm.tsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { Loader2, ArrowLeft, Save, AlertTriangle } from "lucide-react";

const CUSTOMER_TYPES = [
    "RESTAURANT", "HOTEL", "CATERING", "RETAIL",
    "BAKERY", "CAFE", "SUPERMARKET", "OTHER",
];

interface SalesmanOption {
    id: string;
    code: string;
    name: string;
}

interface CustomerFormData {
    code: string;
    name: string;
    name_ar: string;
    type: string;
    group_name: string;
    category: string;
    area: string;
    address: string;
    phone: string;
    credit_days: number;
    credit_limit: number;
    salesman_id: string;
    notes: string;
    is_active: boolean;
}

const EMPTY_FORM: CustomerFormData = {
    code: "", name: "", name_ar: "", type: "",
    group_name: "", category: "", area: "", address: "", phone: "",
    credit_days: 30, credit_limit: 0,
    salesman_id: "", notes: "", is_active: true,
};

export default function CustomerForm() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const isEdit = Boolean(id && id !== "new");

    const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [salesmen, setSalesmen] = useState<SalesmanOption[]>([]);
    const [salesmenLoading, setSalesmenLoading] = useState(true);

    useEffect(() => {
        async function loadSalesmen() {
            setSalesmenLoading(true);
            const { data, error: err } = await supabase
                .from("salesmen")
                .select("id, code, name")
                .or("is_active.eq.true,is_active.is.null")
                .order("name");

            if (!err && data) {
                setSalesmen(data as SalesmanOption[]);
            }
            setSalesmenLoading(false);
        }
        loadSalesmen();
    }, []);

    useEffect(() => {
        if (!isEdit) {
            setLoading(false);
            return;
        }

        async function loadCustomer() {
            const { data, error: err } = await supabase
                .from("customers")
                .select("*")
                .eq("id", id)
                .single();

            if (err || !data) {
                setError("Customer not found.");
            } else {
                setForm({
                    code: data.code ?? "",
                    name: data.name ?? "",
                    name_ar: data.name_ar ?? "",
                    type: data.type ?? "",
                    group_name: data.group_name ?? "",
                    category: data.category ?? "",
                    area: data.area ?? "",
                    address: (data as any).address ?? "",
                    phone: data.phone ?? "",
                    credit_days: data.credit_days ?? 30,
                    credit_limit: data.credit_limit ?? 0,
                    salesman_id: data.salesman_id ?? "",
                    notes: data.notes ?? "",
                    is_active: data.is_active ?? true,
                });
            }
            setLoading(false);
        }
        loadCustomer();
    }, [id, isEdit]);

    const set = (field: keyof CustomerFormData, value: string | number | boolean) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError(null);
    };

    const handleSave = async () => {
        if (!form.code.trim()) { setError("Customer code is required."); return; }
        if (!form.name.trim()) { setError("Customer name is required."); return; }

        setSaving(true);
        setError(null);

        const payload = {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            name_ar: form.name_ar.trim() || null,
            type: form.type || null,
            group_name: form.group_name.trim() || null,
            category: form.category.trim() || null,
            area: form.area.trim() || null,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            credit_days: Number(form.credit_days),
            credit_limit: Number(form.credit_limit),
            salesman_id: form.salesman_id || null,
            notes: form.notes.trim() || null,
            is_active: form.is_active,
            created_by: user?.id,
        };

        let err;
        if (isEdit) {
            ({ error: err } = await supabase
                .from("customers")
                .update(payload)
                .eq("id", id));
        } else {
            ({ error: err } = await supabase
                .from("customers")
                .insert(payload));
        }

        setSaving(false);

        if (err) {
            if (err.code === "23505") {
                setError("This customer code already exists. Use a unique code.");
            } else {
                setError(err.message);
            }
        } else {
            navigate("/customers");
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
                        onClick={() => navigate("/customers")}
                        className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-foreground" />
                    </button>
                    <h1 className="text-lg font-bold text-foreground tracking-tight">
                        {isEdit ? "Edit Customer" : "New Customer"}
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
                        Basic Information
                    </h2>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Code <span className="text-destructive">*</span>
                            </label>
                            <input
                                value={form.code}
                                onChange={(e) => set("code", e.target.value)}
                                placeholder="RT525"
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground uppercase placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Type
                            </label>
                            <select
                                value={form.type}
                                onChange={(e) => set("type", e.target.value)}
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">— Select —</option>
                                {CUSTOMER_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Name (English) <span className="text-destructive">*</span>
                        </label>
                        <input
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                            placeholder="Americana Kuwait Company"
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Name (Arabic)
                        </label>
                        <input
                            value={form.name_ar}
                            onChange={(e) => set("name_ar", e.target.value)}
                            placeholder="أمريكانا الكويت"
                            dir="rtl"
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Group
                            </label>
                            <input
                                value={form.group_name}
                                onChange={(e) => set("group_name", e.target.value)}
                                placeholder="e.g. BAKERY"
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Area / Region
                            </label>
                            <input
                                value={form.area}
                                onChange={(e) => set("area", e.target.value)}
                                placeholder="e.g. QURAIN"
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Address
                        </label>
                        <textarea
                            value={form.address}
                            onChange={(e) => set("address", e.target.value)}
                            rows={2}
                            placeholder="Full address..."
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                    </div>

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
                </section>

                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Credit Terms
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Credit Days
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={form.credit_days}
                                onChange={(e) => set("credit_days", e.target.value)}
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">
                                Credit Limit (KWD)
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={form.credit_limit}
                                onChange={(e) => set("credit_limit", e.target.value)}
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Assignment
                    </h2>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Salesman
                        </label>

                        {salesmenLoading ? (
                            <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Loading salesmen...</span>
                            </div>
                        ) : salesmen.length === 0 ? (
                            <div className="bg-secondary border border-border rounded-md px-3 py-2">
                                <p className="text-xs text-muted-foreground">
                                    No active salesmen found. Add salesmen first to assign one.
                                </p>
                            </div>
                        ) : (
                            <select
                                value={form.salesman_id}
                                onChange={(e) => set("salesman_id", e.target.value)}
                                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">— No salesman —</option>
                                {salesmen.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.code} — {s.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">
                            Notes
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => set("notes", e.target.value)}
                            rows={3}
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                    </div>
                </section>

                {isEdit && (
                    <section>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => set("is_active", e.target.checked)}
                                className="rounded border-border w-4 h-4"
                            />
                            <span className="text-sm text-foreground">Customer is active</span>
                        </label>
                    </section>
                )}
            </main>
        </div>
    );
}
