ALTER TABLE `products` ADD COLUMN `brand_id` text;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `warranty_id` text;
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `group_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `brands_business_name_unique` ON `brands` (`business_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `units` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `units_business_name_unique` ON `units` (`business_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `warranties` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`duration_days` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `warranties_business_name_unique` ON `warranties` (`business_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `customer_groups_business_name_unique` ON `customer_groups` (`business_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`location_id` text NOT NULL,
	`reference` text NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `stock_adjustments_business_reference_unique` ON `stock_adjustments` (`business_id`,`reference`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `stock_adjustments_business_created_idx` ON `stock_adjustments` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_adjustment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_id` text NOT NULL,
	`product_id` text NOT NULL,
	`movement_id` text,
	`qty_delta` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movement_id`) REFERENCES `stock_movements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `stock_adjustment_items_adjustment_idx` ON `stock_adjustment_items` (`adjustment_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`supplier_id` text,
	`location_id` text NOT NULL,
	`reference` text NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`total_kobo` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `purchase_returns_business_reference_unique` ON `purchase_returns` (`business_id`,`reference`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchase_returns_business_created_idx` ON `purchase_returns` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `purchase_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_cost_kobo` integer NOT NULL,
	`line_total_kobo` integer NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `purchase_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchase_return_items_return_idx` ON `purchase_return_items` (`return_id`);
