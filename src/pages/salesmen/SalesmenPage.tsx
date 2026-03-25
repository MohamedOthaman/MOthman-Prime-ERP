import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Plus, Search, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRole } from "@/features/reports/hooks/useRole";

interface Salesman {
    id: string;
    code: string;
    name: string;
    name_ar: string | null;
    phone: string | null;
    email: string | null;
    is_active: boolean;
}

export default function SalesmenPage() {
    const navigate = useNavigate();
    const { isAdmin, isSalesManager } = useRole();

    const [salesmen, setSalesmen] = useState<Salesman[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        async function load() {
            setLoading(true);

            const { data, error } = await supabase
                .from("salesmen")
                .select("id, code, name, name_ar, phone, email, is_active")
                .order("name", { ascending: true });

            if (!error && data) {
                setSalesmen(data as Salesman[]);
            }

            setLoading(false);
        }

        load();
    }, []);

    const filtered = salesmen.filter((s) => {
        const q = search.toLowerCase().trim();

        return (
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            (s.name_ar ? s.name_ar.includes(search) : false)
        );
    });

    return (
        <div className="min-h-screen bg-background pb-20">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-5 h-5 text-primary" />
                        <h1 className="text-lg font-medium text-foreground">Salesmen</h1>

                        <span className="ml-auto text-xs text-muted-foreground font-mono">
                            {filtered.length} / {salesmen.length}
                        </span>

                        {(isAdmin || isSalesManager) && (
                            <button
                                type="button"
                                onClick={() => navigate("/salesmen/new")}
                                className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                            </button>
                        )}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by name, code, or Arabic name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-secondary text-sm rounded-md pl-9 pr-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-4 space-y-2">
                {loading && (
                    <div className="flex justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No salesmen found</p>
                    </div>
                )}

                {!loading &&
                    filtered.map((salesman) => (
                        <button
                            type="button"
                            key={salesman.id}
                            onClick={() => navigate(`/salesmen/${salesman.id}`)}
                            className="w-full text-left bg-secondary rounded-lg border border-border p-4 hover:border-primary/40 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                                            {salesman.code}
                                        </span>
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {salesman.name}
                                        </span>
                                    </div>

                                    {salesman.name_ar && (
                                        <p
                                            className="text-xs text-muted-foreground text-right mb-1"
                                            dir="rtl"
                                        >
                                            {salesman.name_ar}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-3 flex-wrap">
                                        {salesman.phone && (
                                            <span className="text-xs text-muted-foreground">
                                                {salesman.phone}
                                            </span>
                                        )}

                                        {salesman.email && (
                                            <span className="text-xs text-muted-foreground">
                                                {salesman.email}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    {!salesman.is_active && (
                                        <span className="text-xs bg-red-100 text-red-600 rounded px-1.5 py-0.5">
                                            Inactive
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
            </main>
        </div>
    );
}