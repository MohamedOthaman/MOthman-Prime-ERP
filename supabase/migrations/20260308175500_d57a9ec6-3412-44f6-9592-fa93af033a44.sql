
-- Profiles table for user info
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Brands
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update brands" ON public.brands FOR UPDATE TO authenticated USING (true);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  packaging TEXT NOT NULL DEFAULT '',
  storage_type TEXT NOT NULL DEFAULT 'Dry',
  barcodes TEXT[] DEFAULT '{}',
  carton_holds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE TO authenticated USING (true);

-- Batches
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  batch_no TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'PCS',
  production_date DATE,
  expiry_date DATE NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert batches" ON public.batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update batches" ON public.batches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete batches" ON public.batches FOR DELETE TO authenticated USING (true);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'OUT',
  status TEXT NOT NULL DEFAULT 'ready',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);

-- Invoice items
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  batch_no TEXT NOT NULL DEFAULT '',
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoice_items" ON public.invoice_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete invoice_items" ON public.invoice_items FOR DELETE TO authenticated USING (true);

-- Movements audit log
CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  invoice_no TEXT,
  return_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read movements" ON public.movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert movements" ON public.movements FOR INSERT TO authenticated WITH CHECK (true);

-- Market returns
CREATE TABLE public.market_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL DEFAULT '',
  driver_name TEXT NOT NULL DEFAULT '',
  voucher_number TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.market_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read market_returns" ON public.market_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert market_returns" ON public.market_returns FOR INSERT TO authenticated WITH CHECK (true);

-- Return items
CREATE TABLE public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES public.market_returns(id) ON DELETE CASCADE NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  expiry_date DATE,
  batch_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read return_items" ON public.return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert return_items" ON public.return_items FOR INSERT TO authenticated WITH CHECK (true);
