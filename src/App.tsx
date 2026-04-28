import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { AuthProvider, useAuth } from "@/features/reports/hooks/useAuth";
import { StockProvider } from "@/contexts/StockContext";
import { LanguageProvider, useLang } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PreviewModeProvider } from "@/contexts/PreviewModeContext";
import { BottomNav } from "@/components/BottomNav";
import { TopBar } from "@/components/TopBar";
import { PreviewModeBanner } from "@/components/PreviewModeBanner";
import RoleGuard from "@/components/RoleGuard";

import Index from "./pages/Index";
import DashboardRouter from "./pages/DashboardRouter";
import OwnerDashboard from "./pages/dashboards/OwnerDashboard";
import InvoiceScan from "./pages/InvoiceScan";
import InvoiceListPage from "./pages/invoices/InvoiceListPage";
import ImportExport from "./pages/ImportExport";
import Reports from "./pages/Reports";
import ProductsPage from "./pages/products/ProductsPage";
import UsersPage from "./pages/admin/UsersPage";
import PreviewAsPage from "./pages/admin/PreviewAsPage";
import ProfilePage from "./pages/profile/ProfilePage";

import CustomersPage from "./pages/customers/CustomersPage";
import CustomerForm from "./pages/customers/CustomerForm";

import SalesmenPage from "./pages/salesmen/SalesmenPage";
import SalesmanForm from "./pages/salesmen/SalesmanForm";
import GRNListPage from "./pages/grn/GRNListPage";
import GRNFormPage from "./pages/grn/GRNFormPage";
import GRNDetailsPage from "./pages/grn/GRNDetailsPage";
import GRNPrintPage from "./pages/grn/GRNPrintPage";
import GRNQcPage from "./pages/grn/GRNQcPage";
import InvoiceEntryPage from "./pages/invoices/InvoiceEntryPage";
import InvoiceDetailsPage from "./pages/invoices/InvoiceDetailsPage";
import PickingQueuePage from "./pages/warehouse/PickingQueuePage";
import PickingScreenPage from "./pages/warehouse/PickingScreenPage";
import InventoryMovementsPage from "./pages/warehouse/InventoryMovementsPage";
import ProductImportValidationPage from "./pages/products/ProductImportValidationPage";
import ReturnQueuePage from "./pages/returns/ReturnQueuePage";
import ReturnIntakePage from "./pages/returns/ReturnIntakePage";
import ReturnDetailsPage from "./pages/returns/ReturnDetailsPage";
import BatchTracePage from "./pages/warehouse/BatchTracePage";
import FridgeStoragePage from "./pages/warehouse/FridgeStoragePage";
import ProductTracePage from "./pages/products/ProductTracePage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

import CustomersBySalesman from "./pages/reports/CustomersBySalesman";
import CustomersWithoutSalesman from "./pages/reports/CustomersWithoutSalesman";
import StockReport from "./pages/reports/StockReport";
import SalesPerformanceReport from "./pages/reports/SalesPerformanceReport";
import ProductPerformanceReport from "./pages/reports/ProductPerformanceReport";
import CustomerAnalysisReport from "./pages/reports/CustomerAnalysisReport";
import ExpiryAlertsReport from "./pages/reports/ExpiryAlertsReport";
import AuditLogPage from "./pages/audit/AuditLogPage";

import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { dir } = useLang();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <StockProvider>
      <TopBar />
      {/* Preview mode banner — shown below TopBar when an admin is viewing as another role */}
      <PreviewModeBanner />

      <div dir={dir} className="flex-1 pb-16">
        <PageTransition key={location.pathname}>
        <Routes>
          {/* ── Dashboard (role-adaptive) ─────────────────────── */}
          <Route path="/" element={<DashboardRouter />} />
          <Route path="/stock" element={<Index />} />

          {/* ── Profile & admin tools ─────────────────────────── */}
          <Route path="/profile" element={<ProfilePage />} />

          {/* Invoice list / lifecycle hub — read access for sales + all invoice-capable roles */}
          <Route
            path="/invoices"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "invoice_team", "accountant", "accounting", "cashier",
                  "sales_manager", "salesman", "sales",
                  "warehouse_manager", "warehouse", "inventory_controller",
                ]}
              >
                <InvoiceListPage />
              </RoleGuard>
            }
          />

          {/* Owner Control Panel — direct access route */}
          <Route
            path="/owner"
            element={
              <RoleGuard requiredPermission="isOwner">
                <OwnerDashboard />
              </RoleGuard>
            }
          />

          <Route
            path="/admin/preview-as"
            element={
              <RoleGuard requiredPermission="canPreviewAsUser">
                <PreviewAsPage />
              </RoleGuard>
            }
          />

          {/* ── Invoices ──────────────────────────────────────── */}
          <Route
            path="/invoice-entry"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "invoice_team",
                  "accountant",
                  "ops_manager",
                  "sales_manager",
                ]}
              >
                <InvoiceEntryPage />
              </RoleGuard>
            }
          />

          <Route
            path="/invoice-entry/:id"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "invoice_team",
                  "accountant",
                  "ops_manager",
                  "sales_manager",
                ]}
              >
                <InvoiceEntryPage />
              </RoleGuard>
            }
          />

          <Route
            path="/invoice-scan"
            element={
              <RoleGuard allowedRoles={["admin", "invoice_team", "accountant"]}>
                <InvoiceScan />
              </RoleGuard>
            }
          />

          {/* ── Import / Export ───────────────────────────────── */}
          <Route
            path="/import-export"
            element={
              <RoleGuard
                allowedRoles={["admin", "inventory_controller", "purchase_manager"]}
              >
                <ImportExport />
              </RoleGuard>
            }
          />

          {/* ── Reports ───────────────────────────────────────── */}
          <Route
            path="/reports"
            element={
              <RoleGuard requiredPermission="canViewReports">
                <Reports />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/customers-by-salesman"
            element={
              <RoleGuard allowedRoles={["admin", "ceo", "gm", "sales_manager"]}>
                <CustomersBySalesman />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/customers-without-salesman"
            element={
              <RoleGuard allowedRoles={["admin", "ceo", "gm", "sales_manager"]}>
                <CustomersWithoutSalesman />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/stock"
            element={
              <RoleGuard requiredPermission="canViewReports">
                <StockReport />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/sales"
            element={
              <RoleGuard allowedRoles={["owner", "admin", "ops_manager", "ceo", "gm", "sales_manager", "accountant", "accounting"]}>
                <SalesPerformanceReport />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/products"
            element={
              <RoleGuard requiredPermission="canViewReports">
                <ProductPerformanceReport />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/customers"
            element={
              <RoleGuard allowedRoles={["owner", "admin", "ops_manager", "ceo", "gm", "sales_manager", "accountant", "accounting"]}>
                <CustomerAnalysisReport />
              </RoleGuard>
            }
          />

          <Route
            path="/reports/expiry"
            element={
              <RoleGuard requiredPermission="canManageStock">
                <ExpiryAlertsReport />
              </RoleGuard>
            }
          />

          <Route
            path="/audit"
            element={
              <RoleGuard allowedRoles={["owner", "admin", "ops_manager", "ceo", "gm"]}>
                <AuditLogPage />
              </RoleGuard>
            }
          />

          {/* ── Invoice details ───────────────────────────────── */}
          <Route
            path="/invoices/:id"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "invoice_team", "accountant", "ops_manager",
                  "sales_manager", "warehouse_manager", "warehouse",
                  "inventory_controller", "purchase_manager", "ceo", "gm",
                ]}
              >
                <InvoiceDetailsPage />
              </RoleGuard>
            }
          />

          {/* ── Warehouse picking ─────────────────────────────── */}
          <Route
            path="/warehouse/picking"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "warehouse_manager", "warehouse",
                  "inventory_controller", "purchase_manager",
                ]}
              >
                <PickingQueuePage />
              </RoleGuard>
            }
          />
          <Route
            path="/warehouse/picking/:invoiceId"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "warehouse_manager", "warehouse",
                  "inventory_controller", "purchase_manager",
                ]}
              >
                <PickingScreenPage />
              </RoleGuard>
            }
          />
          <Route
            path="/warehouse/movements"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "warehouse_manager",
                  "inventory_controller", "warehouse", "purchase_manager",
                ]}
              >
                <InventoryMovementsPage />
              </RoleGuard>
            }
          />

          {/* ── Returns ───────────────────────────────────────── */}
          <Route
            path="/returns"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "warehouse_manager", "warehouse", "inventory_controller",
                  "invoice_team", "accountant", "accounting", "cashier",
                  "sales_manager", "purchase_manager",
                ]}
              >
                <ReturnQueuePage />
              </RoleGuard>
            }
          />
          <Route
            path="/returns/new"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager",
                  "warehouse_manager", "warehouse", "inventory_controller",
                  "invoice_team", "accountant", "accounting",
                  "sales_manager", "purchase_manager",
                ]}
              >
                <ReturnIntakePage />
              </RoleGuard>
            }
          />
          <Route
            path="/returns/:id"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "warehouse_manager", "warehouse", "inventory_controller",
                  "invoice_team", "accountant", "accounting", "cashier",
                  "sales_manager", "purchase_manager",
                ]}
              >
                <ReturnDetailsPage />
              </RoleGuard>
            }
          />

          {/* ── Products ──────────────────────────────────────── */}
          <Route
            path="/products"
            element={
              <RoleGuard
                allowedRoles={["admin", "inventory_controller", "purchase_manager"]}
              >
                <ProductsPage />
              </RoleGuard>
            }
          />

          <Route
            path="/products/import-validation"
            element={
              <RoleGuard
                allowedRoles={["admin", "inventory_controller", "purchase_manager"]}
              >
                <ProductImportValidationPage />
              </RoleGuard>
            }
          />

          {/* ── Customers ─────────────────────────────────────── */}
          <Route
            path="/customers"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "sales_manager", "invoice_team"]}
              >
                <CustomersPage />
              </RoleGuard>
            }
          />

          <Route
            path="/customers/new"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "sales_manager", "invoice_team"]}
              >
                <CustomerForm />
              </RoleGuard>
            }
          />

          <Route
            path="/customers/:id"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "sales_manager", "invoice_team"]}
              >
                <CustomerForm />
              </RoleGuard>
            }
          />

          {/* ── Salesmen ──────────────────────────────────────── */}
          <Route
            path="/salesmen"
            element={
              <RoleGuard allowedRoles={["admin", "ops_manager", "sales_manager"]}>
                <SalesmenPage />
              </RoleGuard>
            }
          />

          <Route
            path="/salesmen/new"
            element={
              <RoleGuard allowedRoles={["admin", "ops_manager", "sales_manager"]}>
                <SalesmanForm />
              </RoleGuard>
            }
          />

          <Route
            path="/salesmen/:id"
            element={
              <RoleGuard allowedRoles={["admin", "ops_manager", "sales_manager"]}>
                <SalesmanForm />
              </RoleGuard>
            }
          />

          {/* ── GRN ───────────────────────────────────────────── */}
          <Route
            path="/grn"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "ops_manager",
                  "purchase_manager",
                  "inventory_controller",
                  "warehouse_manager",
                  "warehouse",
                  "qc",
                ]}
              >
                <GRNListPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/new"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "ops_manager",
                  "purchase_manager",
                  "inventory_controller",
                  "warehouse_manager",
                  "warehouse",
                ]}
              >
                <GRNDetailsPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/:id"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "ops_manager",
                  "purchase_manager",
                  "inventory_controller",
                  "warehouse_manager",
                  "warehouse",
                  "qc",
                ]}
              >
                <GRNDetailsPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/:id/qc"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "ops_manager",
                  "warehouse_manager",
                  "inventory_controller",
                  "qc",
                ]}
              >
                <GRNQcPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/:id/print"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin",
                  "ops_manager",
                  "purchase_manager",
                  "inventory_controller",
                  "warehouse_manager",
                  "warehouse",
                  "qc",
                ]}
              >
                <GRNPrintPage />
              </RoleGuard>
            }
          />

          {/* ── Cold storage ──────────────────────────────────── */}
          <Route
            path="/warehouse/fridge"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "warehouse_manager", "inventory_controller", "warehouse",
                  "purchase_manager", "qc",
                ]}
              >
                <FridgeStoragePage />
              </RoleGuard>
            }
          />

          {/* ── Product traceability ──────────────────────────── */}
          <Route
            path="/products/:productId/trace"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "warehouse_manager", "inventory_controller", "warehouse",
                  "purchase_manager", "qc",
                ]}
              >
                <ProductTracePage />
              </RoleGuard>
            }
          />

          {/* ── Batch traceability ────────────────────────────── */}
          <Route
            path="/stock/batch/:batchId"
            element={
              <RoleGuard
                allowedRoles={[
                  "admin", "ops_manager", "ceo", "gm",
                  "warehouse_manager", "inventory_controller", "warehouse",
                  "purchase_manager", "qc",
                ]}
              >
                <BatchTracePage />
              </RoleGuard>
            }
          />

          {/* ── Admin ─────────────────────────────────────────── */}
          <Route
            path="/admin/users"
            element={
              <RoleGuard allowedRoles={["admin"]}>
                <UsersPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RoleGuard allowedRoles={["admin", "ops_manager"]}>
                <AdminSettingsPage />
              </RoleGuard>
            }
          />

          {/* ── Fallbacks ─────────────────────────────────────── */}
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </PageTransition>
      </div>

      <BottomNav />
    </StockProvider>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;

  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <LanguageProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            {/*
              PreviewModeProvider wraps the entire auth tree so that:
              1. usePreviewMode() is available in TopBar, DashboardRouter, and usePermissions
              2. The preview state persists across route navigations (session-only, no DB)
            */}
            <PreviewModeProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<AuthRoute />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/*" element={<ProtectedRoutes />} />
                </Routes>
              </BrowserRouter>
            </PreviewModeProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
