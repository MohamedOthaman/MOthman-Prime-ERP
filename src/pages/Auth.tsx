import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { AppBrand } from "@/components/AppBrand";
import type { LucideIcon } from "lucide-react";
import {
  Crown, ShieldCheck, Building2, Settings2,
  TrendingUp, Users, UserCheck,
  ShoppingBag, PackagePlus, Tag,
  Warehouse, Package, ClipboardList, Archive, CheckSquare,
  Calculator, BookOpen, Receipt, Banknote,
  UserCog, Clipboard,
} from "lucide-react";

interface RoleCard {
  role: string;
  nameAr: string;
  nameEn: string;
  icon: LucideIcon;
  iconClass: string;
}

interface DeptSection {
  nameAr: string;
  nameEn: string;
  roles: RoleCard[];
}

const DEPARTMENTS: DeptSection[] = [
  {
    nameAr: "الإدارة العليا",
    nameEn: "Executive",
    roles: [
      { role: "owner",       nameAr: "مالك النظام",           nameEn: "System Owner",        icon: Crown,        iconClass: "text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40" },
      { role: "admin",       nameAr: "مدير النظام",           nameEn: "System Admin",        icon: ShieldCheck,  iconClass: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40" },
      { role: "ceo",         nameAr: "الرئيس التنفيذي",       nameEn: "CEO",                 icon: Building2,    iconClass: "text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/40" },
      { role: "gm",          nameAr: "المدير العام",          nameEn: "General Manager",     icon: Building2,    iconClass: "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40" },
      { role: "ops_manager", nameAr: "مدير العمليات",        nameEn: "Operations Manager",  icon: Settings2,    iconClass: "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/40" },
    ],
  },
  {
    nameAr: "المبيعات",
    nameEn: "Sales",
    roles: [
      { role: "sales_manager", nameAr: "مدير المبيعات",    nameEn: "Sales Manager",   icon: TrendingUp, iconClass: "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40" },
      { role: "salesman",      nameAr: "مندوب مبيعات",     nameEn: "Salesman",        icon: Users,      iconClass: "text-green-600 bg-green-100 dark:text-green-300 dark:bg-green-900/40" },
      { role: "sales",         nameAr: "فريق المبيعات",    nameEn: "Sales Team",      icon: UserCheck,  iconClass: "text-teal-600 bg-teal-100 dark:text-teal-300 dark:bg-teal-900/40" },
    ],
  },
  {
    nameAr: "المشتريات",
    nameEn: "Purchasing",
    roles: [
      { role: "purchase_manager", nameAr: "مدير المشتريات",          nameEn: "Purchase Manager", icon: ShoppingBag,  iconClass: "text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40" },
      { role: "purchase",         nameAr: "موظف مشتريات",            nameEn: "Purchasing Staff", icon: PackagePlus,  iconClass: "text-yellow-600 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40" },
      { role: "brand_manager",    nameAr: "مدير العلامة التجارية",   nameEn: "Brand Manager",    icon: Tag,          iconClass: "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40" },
    ],
  },
  {
    nameAr: "المستودع والمخزون",
    nameEn: "Warehouse & Inventory",
    roles: [
      { role: "warehouse_manager",   nameAr: "مدير المستودع",     nameEn: "Warehouse Manager",     icon: Warehouse,     iconClass: "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40" },
      { role: "warehouse",           nameAr: "موظف مستودع",       nameEn: "Warehouse Staff",       icon: Package,       iconClass: "text-orange-500 bg-orange-50 dark:text-orange-300 dark:bg-orange-900/30" },
      { role: "inventory_controller",nameAr: "مراقب المخزون",     nameEn: "Inventory Controller",  icon: ClipboardList, iconClass: "text-rose-600 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40" },
      { role: "inventory",           nameAr: "موظف جرد",          nameEn: "Inventory Staff",       icon: Archive,       iconClass: "text-pink-600 bg-pink-100 dark:text-pink-300 dark:bg-pink-900/40" },
      { role: "qc",                  nameAr: "مراقب الجودة",      nameEn: "Quality Control",       icon: CheckSquare,   iconClass: "text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-900/40" },
    ],
  },
  {
    nameAr: "المالية والحسابات",
    nameEn: "Finance & Accounting",
    roles: [
      { role: "accountant",   nameAr: "محاسب",           nameEn: "Accountant",       icon: Calculator, iconClass: "text-cyan-600 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-900/40" },
      { role: "accounting",   nameAr: "فريق المحاسبة",  nameEn: "Accounting Team",  icon: BookOpen,   iconClass: "text-sky-600 bg-sky-100 dark:text-sky-300 dark:bg-sky-900/40" },
      { role: "invoice_team", nameAr: "فريق الفواتير",  nameEn: "Invoice Team",     icon: Receipt,    iconClass: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40" },
      { role: "cashier",      nameAr: "كاشير",          nameEn: "Cashier",          icon: Banknote,   iconClass: "text-teal-600 bg-teal-100 dark:text-teal-300 dark:bg-teal-900/40" },
    ],
  },
  {
    nameAr: "الموارد البشرية والإدارة",
    nameEn: "HR & Administration",
    roles: [
      { role: "hr",        nameAr: "موارد بشرية", nameEn: "Human Resources", icon: UserCog,   iconClass: "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/40" },
      { role: "secretary", nameAr: "سكرتير",      nameEn: "Secretary",       icon: Clipboard, iconClass: "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40" },
    ],
  },
];

export default function Auth() {
  const { signInWithRole } = useAuth();
  const navigate = useNavigate();

  const handleSelect = (role: string) => {
    signInWithRole(role);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-16 space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <AppBrand className="justify-center" showDeveloperCredit />
          <h1 className="text-2xl font-bold text-foreground pt-3">اختر وظيفتك</h1>
          <p className="text-sm text-muted-foreground">انقر على وظيفتك للدخول إلى لوحة التحكم الخاصة بك</p>
        </div>

        {/* Role sections */}
        {DEPARTMENTS.map((dept) => (
          <section key={dept.nameEn} className="space-y-3">

            {/* Section header */}
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground whitespace-nowrap">{dept.nameAr}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{dept.nameEn}</span>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {dept.roles.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.role}
                    onClick={() => handleSelect(item.role)}
                    className="group flex flex-col items-center gap-3 p-4 rounded-2xl border border-border bg-card text-card-foreground
                               hover:border-primary/60 hover:bg-accent/40 hover:shadow-lg hover:-translate-y-1
                               active:translate-y-0 active:shadow-sm
                               transition-all duration-200 ease-out text-center"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${item.iconClass}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-sm text-foreground leading-snug">{item.nameAr}</div>
                      <div className="text-xs text-muted-foreground">{item.nameEn}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-muted-foreground">
          بيئة تجريبية — كل وظيفة تُظهر صلاحياتها وبياناتها الخاصة
        </p>
      </div>
    </div>
  );
}
