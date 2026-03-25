DROP POLICY IF EXISTS "Authenticated users can read receiving_headers" ON public.receiving_headers;
DROP POLICY IF EXISTS "Authenticated users can insert receiving_headers" ON public.receiving_headers;
DROP POLICY IF EXISTS "Authenticated users can update receiving_headers" ON public.receiving_headers;
DROP POLICY IF EXISTS "Authenticated users can delete receiving_headers" ON public.receiving_headers;

CREATE POLICY "Authenticated users can read receiving_headers"
ON public.receiving_headers
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized users can insert receiving_headers"
ON public.receiving_headers
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

CREATE POLICY "Authorized users can update receiving_headers"
ON public.receiving_headers
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

CREATE POLICY "Admins can delete receiving_headers"
ON public.receiving_headers
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can read receiving_lines" ON public.receiving_lines;
DROP POLICY IF EXISTS "Authenticated users can insert receiving_lines" ON public.receiving_lines;
DROP POLICY IF EXISTS "Authenticated users can update receiving_lines" ON public.receiving_lines;
DROP POLICY IF EXISTS "Authenticated users can delete receiving_lines" ON public.receiving_lines;

CREATE POLICY "Authenticated users can read receiving_lines"
ON public.receiving_lines
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized users can insert receiving_lines"
ON public.receiving_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

CREATE POLICY "Authorized users can update receiving_lines"
ON public.receiving_lines
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

CREATE POLICY "Admins can delete receiving_lines"
ON public.receiving_lines
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

ALTER TABLE public.receiving_lines
  ADD CONSTRAINT receiving_lines_header_id_line_no_key UNIQUE (header_id, line_no);
