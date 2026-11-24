-- Cover the POS catalogue filters and ordering (business, active, category, name).
CREATE INDEX IF NOT EXISTS `products_business_active_name_idx` ON `products` (`business_id`, `is_active`, `name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_business_active_category_name_idx` ON `products` (`business_id`, `is_active`, `category_id`, `name`);
