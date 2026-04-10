-- Phase 3 Finalization: Status hardening for receiving_headers
-- Maps legacy values and adds a CHECK constraint

-- Step 1: Map legacy status values to the new standard values
UPDATE public.receiving_headers
SET status = 'inspected'
WHERE status = 'inspecting';

UPDATE public.receiving_headers
SET status = 'approved'
WHERE status = 'completed';

UPDATE public.receiving_headers
SET status = 'rejected'
WHERE status = 'cancelled';

-- Step 2: Default any unknown / NULL values to 'draft'
UPDATE public.receiving_headers
SET status = 'draft'
WHERE status IS NULL
   OR status NOT IN ('draft', 'received', 'inspected', 'municipality_pending', 'approved', 'rejected');

-- Step 3: Add CHECK constraint (drop if already exists for idempotency)
ALTER TABLE public.receiving_headers
  DROP CONSTRAINT IF EXISTS receiving_headers_status_check;

ALTER TABLE public.receiving_headers
  ADD CONSTRAINT receiving_headers_status_check
  CHECK (status IN ('draft', 'received', 'inspected', 'municipality_pending', 'approved', 'rejected'));

-- Step 4: Set NOT NULL + default
ALTER TABLE public.receiving_headers
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft';

-- Step 5: Add audit columns if they don't exist
ALTER TABLE public.receiving_headers
  ADD COLUMN IF NOT EXISTS inspected_by UUID,
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipality_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipality_approved_by UUID,
  ADD COLUMN IF NOT EXISTS rejected_by UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 6: Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION public.set_receiving_headers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receiving_headers_updated_at ON public.receiving_headers;

CREATE TRIGGER trg_receiving_headers_updated_at
  BEFORE UPDATE ON public.receiving_headers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_receiving_headers_updated_at();

-- Step 7: Update inventory trigger to only fire on municipality_pending → approved
-- (keeps the existing trigger but tightens the guard)
CREATE OR REPLACE FUNCTION public.create_receiving_inventory_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ONLY create inventory transactions when transitioning TO 'approved'
  -- from a non-approved state. This enforces the municipality approval rule.
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
      COALESCE(NEW.approved_at, now())
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
