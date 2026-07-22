-- ═══════════════════════════════════════════════════════════════════════════
-- Storage buckets: product-images (public read) + documents (private)
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Verified 2026-07-06: neither bucket exists live (storage probe returned
-- "Bucket not found"). Apply via the Supabase dashboard SQL editor or CLI in
-- a maintenance window. Additive only — safe to re-run (idempotent).
--
-- product-images: product master photos. Public read (list thumbnails render
--   without signed-URL round-trips), writes restricted to authenticated staff.
-- documents: uploaded quotations/POs for the extraction pipeline
--   (InvoiceEntryPage stores originals here; ocr_documents.storage_path
--   references these keys). Private: read + write for authenticated only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 5242880,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('documents', 'documents', false, 20971520,
   ARRAY['application/pdf','image/jpeg','image/png','image/webp',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel'])
ON CONFLICT (id) DO NOTHING;

-- Policies (storage.objects RLS is enabled by default on Supabase).
DO $$
BEGIN
  -- product-images: anyone can read, authenticated staff manage.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'product_images_public_read') THEN
    CREATE POLICY product_images_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'product-images');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'product_images_auth_write') THEN
    CREATE POLICY product_images_auth_write ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'product-images'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','ops_manager','purchase','purchase_manager','manager'])
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'product_images_auth_update') THEN
    CREATE POLICY product_images_auth_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'product-images'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','ops_manager','purchase','purchase_manager','manager'])
      )
      WITH CHECK (
        bucket_id = 'product-images'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','ops_manager','purchase','purchase_manager','manager'])
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'product_images_auth_delete') THEN
    CREATE POLICY product_images_auth_delete ON storage.objects
      FOR DELETE TO authenticated USING (
        bucket_id = 'product-images'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','ops_manager','purchase','purchase_manager','manager'])
      );
  END IF;

  -- documents: authenticated staff only (read and write).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'documents_auth_read') THEN
    CREATE POLICY documents_auth_read ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'documents'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','invoice_team','accountant','accounting','ops_manager','sales_manager'])
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'documents_auth_write') THEN
    CREATE POLICY documents_auth_write ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'documents'
        AND public.get_my_role() = ANY (ARRAY['admin','owner','invoice_team','accountant','accounting','ops_manager','sales_manager'])
      );
  END IF;
END $$;
