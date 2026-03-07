import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StockProvider } from "@/contexts/StockContext";
import { BottomNav } from "@/components/BottomNav";
import Index from "./pages/Index";
import InvoiceScan from "./pages/InvoiceScan";
import ImportExport from "./pages/ImportExport";
import Reports from "./pages/Reports";
import ProductManagement from "./pages/ProductManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <StockProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/invoice-scan" element={<InvoiceScan />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/products" element={<ProductManagement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <BottomNav />
        </BrowserRouter>
      </StockProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
