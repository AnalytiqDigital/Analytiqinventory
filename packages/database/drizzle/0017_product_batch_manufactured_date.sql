-- Record when a batch was manufactured alongside its expiry, so pack dates
-- captured on the product form survive into batch tracking and expiry alerts.
ALTER TABLE `product_batches` ADD COLUMN `manufactured_date` integer;
