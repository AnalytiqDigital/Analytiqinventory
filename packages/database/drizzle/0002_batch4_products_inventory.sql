-- Batch 4: products + append-only inventory ledger.
CREATE TABLE IF NOT EXISTS `categories` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `categories_business_name_unique` ON `categories` (`business_id`, `name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `products` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `sku` text,
  `barcode` text,
  `category_id` text REFERENCES `categories`(`id`),
  `unit` text DEFAULT 'pcs' NOT NULL,
  `cost_price_kobo` integer DEFAULT 0 NOT NULL,
  `selling_price_kobo` integer DEFAULT 0 NOT NULL,
  `reorder_level` integer DEFAULT 0 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `products_business_sku_unique` ON `products` (`business_id`, `sku`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `products_business_barcode_unique` ON `products` (`business_id`, `barcode`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_business_name_idx` ON `products` (`business_id`, `name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_category_idx` ON `products` (`category_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `product_id` text NOT NULL REFERENCES `products`(`id`),
  `location_id` text NOT NULL REFERENCES `locations`(`id`),
  `kind` text NOT NULL,
  `qty_delta` integer NOT NULL,
  `qty_after` integer NOT NULL,
  `reason` text DEFAULT '' NOT NULL,
  `user_id` text REFERENCES `users`(`id`),
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `movements_business_product_idx` ON `stock_movements` (`business_id`, `product_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `movements_location_idx` ON `stock_movements` (`location_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `movements_created_idx` ON `stock_movements` (`created_at`);
