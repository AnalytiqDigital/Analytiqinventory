-- Batch 6: customers, suppliers, purchasing, customer credit payments.
CREATE TABLE IF NOT EXISTS `customers` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`name` text NOT NULL,
`phone` text DEFAULT '' NOT NULL,
`email` text DEFAULT '' NOT NULL,
`address` text DEFAULT '' NOT NULL,
`note` text DEFAULT '' NOT NULL,
`credit_limit_kobo` integer DEFAULT 0 NOT NULL,
`is_active` integer DEFAULT 1 NOT NULL,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_business_name_idx` ON `customers` (`business_id`, `name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_business_phone_idx` ON `customers` (`business_id`, `phone`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `suppliers` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`name` text NOT NULL,
`contact_name` text DEFAULT '' NOT NULL,
`phone` text DEFAULT '' NOT NULL,
`email` text DEFAULT '' NOT NULL,
`address` text DEFAULT '' NOT NULL,
`note` text DEFAULT '' NOT NULL,
`is_active` integer DEFAULT 1 NOT NULL,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `suppliers_business_name_idx` ON `suppliers` (`business_id`, `name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchases` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`location_id` text NOT NULL REFERENCES `locations`(`id`),
`supplier_id` text REFERENCES `suppliers`(`id`),
`reference` text NOT NULL,
`status` text DEFAULT 'draft' NOT NULL,
`subtotal_kobo` integer DEFAULT 0 NOT NULL,
`tax_kobo` integer DEFAULT 0 NOT NULL,
`total_kobo` integer DEFAULT 0 NOT NULL,
`amount_paid_kobo` integer DEFAULT 0 NOT NULL,
`note` text DEFAULT '' NOT NULL,
`received_by` text REFERENCES `users`(`id`),
`received_at` integer,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `purchases_business_ref_unique` ON `purchases` (`business_id`, `reference`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchases_business_created_idx` ON `purchases` (`business_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchases_supplier_idx` ON `purchases` (`supplier_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_items` (
`id` text PRIMARY KEY NOT NULL,
`purchase_id` text NOT NULL REFERENCES `purchases`(`id`),
`product_id` text NOT NULL REFERENCES `products`(`id`),
`qty` integer NOT NULL,
`unit_cost_kobo` integer NOT NULL,
`line_total_kobo` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchase_items_purchase_idx` ON `purchase_items` (`purchase_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_payments` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`customer_id` text NOT NULL REFERENCES `customers`(`id`),
`sale_id` text REFERENCES `sales`(`id`),
`amount_kobo` integer NOT NULL,
`method` text DEFAULT 'cash' NOT NULL,
`reference` text DEFAULT '' NOT NULL,
`user_id` text REFERENCES `users`(`id`),
`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_payments_customer_idx` ON `customer_payments` (`customer_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_payments_business_created_idx` ON `customer_payments` (`business_id`, `created_at`);
--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_id` text REFERENCES `customers`(`id`);
