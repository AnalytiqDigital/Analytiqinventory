-- Restaurant pack: tax categories, product images, dining tables.
CREATE TABLE IF NOT EXISTS `tax_categories` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`name` text NOT NULL,
`rate_bps` integer DEFAULT 0 NOT NULL,
`is_default` integer DEFAULT 0 NOT NULL,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tax_categories_business_name_unique` ON `tax_categories` (`business_id`, `name`);
--> statement-breakpoint
ALTER TABLE `products` ADD `image_path` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD `tax_category_id` text REFERENCES `tax_categories`(`id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dining_tables` (
`id` text PRIMARY KEY NOT NULL,
`business_id` text NOT NULL REFERENCES `businesses`(`id`),
`location_id` text NOT NULL REFERENCES `locations`(`id`),
`name` text NOT NULL,
`seats` integer DEFAULT 4 NOT NULL,
`status` text DEFAULT 'free' NOT NULL,
`note` text DEFAULT '' NOT NULL,
`version` integer DEFAULT 1 NOT NULL,
`created_at` integer NOT NULL,
`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `dining_tables_location_name_unique` ON `dining_tables` (`location_id`, `name`);
--> statement-breakpoint
ALTER TABLE `sales` ADD `table_id` text REFERENCES `dining_tables`(`id`);
