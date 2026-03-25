import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/features/reports/hooks/useAuth";
import { StockProvider } from "@/contexts/StockContext";
import { LanguageProvider, useLang } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BottomNav } from "@/components/BottomNav";
import { TopBar } from "@/components/TopBar";
import RoleGuard from "@/components/RoleGuard";

import Index from "./pages/Index";
import InvoiceScan from "./pages/InvoiceScan";
import ImportExport from "./pages/ImportExport";
import Reports from "./pages/Reports";
import ProductManagement from "./pages/ProductManagement";
import UsersPage from "./pages/admin/UsersPage";

import CustomersPage from "./pages/customers/CustomersPage";
import CustomerForm from "./pages/customers/CustomerForm";

import SalesmenPage from "./pages/salesmen/SalesmenPage";
import SalesmanForm from "./pages/salesmen/SalesmanForm";
import GRNListPage from "./pages/grn/GRNListPage";
import GRNFormPage from "./pages/grn/GRNFormPage";
import GRNDetailsPage from "./pages/grn/GRNDetailsPage";

import CustomersBySalesman from "./pages/reports/CustomersBySalesman";
import CustomersWithoutSalesman from "./pages/reports/CustomersWithoutSalesman";

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

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <StockProvider>
      <TopBar />
      <div dir={dir} className="flex-1 pb-16">
        <Routes>
          <Route path="/" element={<Index />} />

          <Route
            path="/invoice-scan"
            element={
              <RoleGuard allowedRoles={["admin", "invoice_team", "accountant"]}>
                <InvoiceScan />
              </RoleGuard>
            }
          />

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

          <Route
            path="/reports"
            element={
              <RoleGuard
                allowedRoles={["admin", "ceo", "gm", "sales_manager", "secretary"]}
              >
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
            path="/products"
            element={
              <RoleGuard
                allowedRoles={["admin", "inventory_controller", "purchase_manager"]}
              >
                <ProductManagement />
              </RoleGuard>
            }
          />

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

          <Route
            path="/grn"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "purchase_manager", "warehouse_manager"]}
              >
                <GRNListPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/new"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "purchase_manager", "warehouse_manager"]}
              >
                <GRNFormPage />
              </RoleGuard>
            }
          />

          <Route
            path="/grn/:id"
            element={
              <RoleGuard
                allowedRoles={["admin", "ops_manager", "purchase_manager", "warehouse_manager"]}
              >
                <GRNDetailsPage />
              </RoleGuard>
            }
          />

          <Route
            path="/admin/users"
            element={
              <RoleGuard allowedRoles={["admin"]}>
                <UsersPage />
              </RoleGuard>
            }
          />

          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
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
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<AuthRoute />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
