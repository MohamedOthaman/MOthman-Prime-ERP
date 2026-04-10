ALTER TABLE public.receiving_headers
  ADD COLUMN IF NOT EXISTS grv_no TEXT,
  ADD COLUMN IF NOT EXISTS grn_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS po_no TEXT,
  ADD COLUMN IF NOT EXISTS lpo_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_code TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS airway_bill_no TEXT,
  ADD COLUMN IF NOT EXISTS manual_ref_no TEXT,
  ADD COLUMN IF NOT EXISTS manual_invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS shipment_condition TEXT,
  ADD COLUMN IF NOT EXISTS shipment_by TEXT,
  ADD COLUMN IF NOT EXISTS bl_no TEXT,
  ADD COLUMN IF NOT EXISTS container_no TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS nos NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS net_weight NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS total_ctn NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS total_pallet NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS temp_type TEXT,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS transaction_date DATE DEFAULT CURRENT_DATE;

UPDATE public.receiving_headers
SET
  grn_date = COALESCE(grn_date, arrival_date, received_date, CURRENT_DATE),
  transaction_date = COALESCE(transaction_date, arrival_date, received_date, CURRENT_DATE),
  manual_ref_no = COALESCE(manual_ref_no, reference_no),
  manual_invoice_no = COALESCE(manual_invoice_no, invoice_no),
  remarks = COALESCE(remarks, notes)
WHERE
  grn_date IS NULL
  OR transaction_date IS NULL
  OR (manual_ref_no IS NULL AND reference_no IS NOT NULL)
  OR (manual_invoice_no IS NULL AND invoice_no IS NOT NULL)
  OR (remarks IS NULL AND notes IS NOT NULL);

ALTER TABLE public.receiving_lines
  ADD COLUMN IF NOT EXISTS store TEXT,
  ADD COLUMN IF NOT EXISTS uom TEXT,
  ADD COLUMN IF NOT EXISTS po_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS shipped_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS short_excess_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS short_excess_reason TEXT,
  ADD COLUMN IF NOT EXISTS production_date DATE,
  ADD COLUMN IF NOT EXISTS po_no TEXT,
  ADD COLUMN IF NOT EXISTS arabic_label TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

UPDATE public.receiving_lines
SET
  uom = COALESCE(uom, unit, 'PCS'),
  received_quantity = COALESCE(received_quantity, quantity, qty, 0),
  short_excess_quantity = COALESCE(
    short_excess_quantity,
    COALESCE(received_quantity, quantity, qty, 0) - COALESCE(shipped_quantity, 0)
  )
WHERE
  uom IS NULL
  OR received_quantity IS NULL
  OR short_excess_quantity IS NULL;

ALTER TABLE public.receiving_lines
  ALTER COLUMN received_quantity SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_receiving_line_compat_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity IS NULL AND NEW.received_quantity IS NOT NULL THEN
    NEW.quantity = NEW.received_quantity;
  END IF;

  IF NEW.received_quantity IS NULL AND NEW.quantity IS NOT NULL THEN
    NEW.received_quantity = NEW.quantity;
  END IF;

  IF NEW.quantity IS NULL AND NEW.qty IS NOT NULL THEN
    NEW.quantity = NEW.qty;
  END IF;

  IF NEW.qty IS NULL AND NEW.quantity IS NOT NULL THEN
    NEW.qty = NEW.quantity;
  END IF;

  IF NEW.received_quantity IS NULL AND NEW.qty IS NOT NULL THEN
    NEW.received_quantity = NEW.qty;
  END IF;

  IF NEW.uom IS NULL AND NEW.unit IS NOT NULL THEN
    NEW.uom = NEW.unit;
  END IF;

  IF NEW.unit IS NULL AND NEW.uom IS NOT NULL THEN
    NEW.unit = NEW.uom;
  END IF;

  IF NEW.short_excess_quantity IS NULL THEN
    NEW.short_excess_quantity = COALESCE(NEW.received_quantity, 0) - COALESCE(NEW.shipped_quantity, 0);
  END IF;

  IF NEW.notes IS NULL AND NEW.remarks IS NOT NULL THEN
    NEW.notes = NEW.remarks;
  END IF;

  IF NEW.remarks IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.remarks = NEW.notes;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS production_date DATE;

CREATE OR REPLACE FUNCTION public.create_receiving_inventory_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    INSERT INTO public.inventory_transactions (
      type,
      reference_type,
      reference_id,
      reference_line_id,
      product_id,
      quantity,
      batch_no,
      expiry_date,
      production_date,
      created_at
    )
    SELECT
      'IN',
      'GRN',
      NEW.id,
      line.id,
      line.product_id,
      COALESCE(line.received_quantity, line.quantity, line.qty, 0),
      NULLIF(BTRIM(line.batch_no), ''),
      line.expiry_date,
      line.production_date,
      COALESCE(NEW.approved_at, NEW.created_at, now())
    FROM public.receiving_lines AS line
    WHERE line.header_id = NEW.id
      AND line.product_id IS NOT NULL
      AND COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
    ON CONFLICT (reference_type, reference_id, reference_line_id, type) DO NOTHING;

    NEW.approved_at = COALESCE(NEW.approved_at, now());
  ELSIF NEW.status <> 'approved' THEN
    NEW.approved_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.inventory_transactions (
  type,
  reference_type,
  reference_id,
  reference_line_id,
  product_id,
  quantity,
  batch_no,
  expiry_date,
  production_date,
  created_at
)
SELECT
  'IN',
  'GRN',
  header.id,
  line.id,
  line.product_id,
  COALESCE(line.received_quantity, line.quantity, line.qty, 0),
  NULLIF(BTRIM(line.batch_no), ''),
  line.expiry_date,
  line.production_date,
  COALESCE(header.approved_at, header.created_at)
FROM public.receiving_headers AS header
JOIN public.receiving_lines AS line
  ON line.header_id = header.id
WHERE header.status = 'approved'
  AND line.product_id IS NOT NULL
  AND COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
ON CONFLICT (reference_type, reference_id, reference_line_id, type) DO NOTHING;
