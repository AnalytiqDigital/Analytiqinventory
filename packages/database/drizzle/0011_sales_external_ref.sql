-- Batch 13: bulk import. Keeps the source system's sale reference so a CSV
-- import is idempotent (re-uploading the same file is rejected per receipt).
ALTER TABLE sales ADD COLUMN external_ref TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX sales_business_external_ref_unique
  ON sales (business_id, external_ref)
  WHERE external_ref IS NOT NULL;
