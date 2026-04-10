-- Serving temperature: product labels for warm / cold checks
ALTER TABLE haccp_bereiden
  ADD COLUMN IF NOT EXISTS serveertemp_warm_product TEXT;

ALTER TABLE haccp_bereiden
  ADD COLUMN IF NOT EXISTS serveertemp_koud_product TEXT;

COMMENT ON COLUMN haccp_bereiden.serveertemp_warm_product IS 'Warm serving line product being temperature-checked.';
COMMENT ON COLUMN haccp_bereiden.serveertemp_koud_product IS 'Cold serving line product being temperature-checked.';

-- Supplier audit documents (Storage path relative to bucket haccp-supplier-docs)
ALTER TABLE haccp_leveranciers
  ADD COLUMN IF NOT EXISTS audit_document_path TEXT;

COMMENT ON COLUMN haccp_leveranciers.audit_document_path IS 'Path in storage bucket haccp-supplier-docs for uploaded compliance document.';

-- Private bucket for supplier PDFs/images (50 MB cap optional; mime list via Dashboard if needed)
INSERT INTO storage.buckets (id, name, public)
VALUES ('haccp-supplier-docs', 'haccp-supplier-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "haccp_supplier_docs_select" ON storage.objects;
CREATE POLICY "haccp_supplier_docs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'haccp-supplier-docs');

DROP POLICY IF EXISTS "haccp_supplier_docs_insert" ON storage.objects;
CREATE POLICY "haccp_supplier_docs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'haccp-supplier-docs');

DROP POLICY IF EXISTS "haccp_supplier_docs_update" ON storage.objects;
CREATE POLICY "haccp_supplier_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'haccp-supplier-docs')
  WITH CHECK (bucket_id = 'haccp-supplier-docs');

DROP POLICY IF EXISTS "haccp_supplier_docs_delete" ON storage.objects;
CREATE POLICY "haccp_supplier_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'haccp-supplier-docs');
