-- Multiple audit documents per supplier (e.g. questionnaire + certificate)
ALTER TABLE haccp_leveranciers
  ADD COLUMN IF NOT EXISTS audit_document_paths TEXT[];

COMMENT ON COLUMN haccp_leveranciers.audit_document_paths IS 'Storage paths in haccp-supplier-docs; one file per path.';

UPDATE haccp_leveranciers
SET audit_document_paths = ARRAY[audit_document_path]
WHERE audit_document_path IS NOT NULL
  AND (audit_document_paths IS NULL OR array_length(audit_document_paths, 1) IS NULL);
