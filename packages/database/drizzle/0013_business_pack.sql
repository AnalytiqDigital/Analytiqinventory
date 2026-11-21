ALTER TABLE `products` ADD COLUMN `track_batches` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `near_expiry_days` integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD COLUMN `batch_id` text;
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `price_tier_id` text;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `loyalty_points_redeemed` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `loyalty_discount_kobo` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `loyalty_points_earned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_items` ADD COLUMN `batch_no` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_items` ADD COLUMN `expiry_date` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`batch_no` text DEFAULT '' NOT NULL,
	`expiry_date` integer,
	`note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `product_batches_business_expiry_idx` ON `product_batches` (`business_id`,`expiry_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `product_batches_product_location_idx` ON `product_batches` (`product_id`,`location_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `price_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `price_tiers_business_name_unique` ON `price_tiers` (`business_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price_tier_id` text NOT NULL,
	`price_kobo` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`price_tier_id`) REFERENCES `price_tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `product_prices_product_tier_unique` ON `product_prices` (`product_id`,`price_tier_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `product_prices_tier_idx` ON `product_prices` (`price_tier_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_notes_customer_idx` ON `customer_notes` (`customer_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `loyalty_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`sale_id` text,
	`kind` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loyalty_entries_customer_idx` ON `loyalty_entries` (`customer_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `loyalty_entries_sale_kind_unique` ON `loyalty_entries` (`sale_id`,`kind`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`location_id` text NOT NULL,
	`receipt_no` text NOT NULL,
	`kind` text DEFAULT 'refund' NOT NULL,
	`reason` text NOT NULL,
	`refund_kobo` integer DEFAULT 0 NOT NULL,
	`refund_method` text DEFAULT 'cash' NOT NULL,
	`exchange_sale_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sale_returns_business_idx` ON `sale_returns` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sale_returns_sale_idx` ON `sale_returns` (`sale_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`sale_item_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty` integer NOT NULL,
	`refund_kobo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `sale_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sale_return_items_return_idx` ON `sale_return_items` (`return_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`reference` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `stock_transfers_business_reference_unique` ON `stock_transfers` (`business_id`,`reference`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_transfer_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty` integer NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `stock_transfer_items_transfer_idx` ON `stock_transfer_items` (`transfer_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `debtor_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`balance_kobo` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `debtor_reminders_business_idx` ON `debtor_reminders` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `backup_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`file_name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `backup_uploads_business_idx` ON `backup_uploads` (`business_id`,`created_at`);
