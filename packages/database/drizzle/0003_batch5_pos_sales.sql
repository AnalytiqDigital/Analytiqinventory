-- Batch 5: POS + cash register. Atomic sales with reversal records, never deletes.
CREATE TABLE IF NOT EXISTS `sales` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`location_id` text NOT NULL REFERENCES `locations`(`id`),
`receipt_no` text NOT NULL,
`cashier_id` text REFERENCES `users`(`id`),
`status` text DEFAULT 'completed' NOT NULL,
`subtotal_kobo` integer DEFAULT 0 NOT NULL,
`line_discount_kobo` integer DEFAULT 0 NOT NULL,
`header_discount_kobo` integer DEFAULT 0 NOT NULL,
`tax_kobo` integer DEFAULT 0 NOT NULL,
`total_kobo` integer DEFAULT 0 NOT NULL,
`amount_paid_kobo` integer DEFAULT 0 NOT NULL,
`change_kobo` integer DEFAULT 0 NOT NULL,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sales_business_receipt_unique` ON `sales` (`business_id`, `receipt_no`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_business_created_idx` ON `sales` (`business_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_location_idx` ON `sales` (`location_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_items` (
`id` text PRIMARY KEY NOT NULL,
`sale_id` text NOT NULL REFERENCES `sales`(`id`),
`product_id` text NOT NULL REFERENCES `products`(`id`),
`qty` integer NOT NULL,
`unit_price_kobo` integer NOT NULL,
`line_discount_kobo` integer DEFAULT 0 NOT NULL,
`line_total_kobo` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sale_items_sale_idx` ON `sale_items` (`sale_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_payments` (
`id` text PRIMARY KEY NOT NULL,
`sale_id` text NOT NULL REFERENCES `sales`(`id`),
`method` text NOT NULL,
`amount_kobo` integer NOT NULL,
`reference` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sale_payments_sale_idx` ON `sale_payments` (`sale_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_reversals` (
`id` text PRIMARY KEY NOT NULL,
`sale_id` text NOT NULL REFERENCES `sales`(`id`),
`reason` text NOT NULL,
`reversed_by` text REFERENCES `users`(`id`),
`created_at` integer NOT NULL
);
