-- Batch 3: database, authentication, business setup.
CREATE TABLE IF NOT EXISTS `businesses` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `address` text DEFAULT '' NOT NULL,
  `phone` text NOT NULL,
  `email` text NOT NULL,
  `currency` text DEFAULT 'NGN' NOT NULL,
  `tax_label` text DEFAULT 'VAT' NOT NULL,
  `tax_rate_bps` integer DEFAULT 750 NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `locations` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `address` text DEFAULT '' NOT NULL,
  `is_default` integer DEFAULT 0 NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` integer,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_business_email_unique` ON `users` (`business_id`, `email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roles` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `is_system` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `permissions` (
  `key` text PRIMARY KEY NOT NULL,
  `description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` text NOT NULL REFERENCES `roles`(`id`),
  `permission_key` text NOT NULL REFERENCES `permissions`(`key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role_id` text NOT NULL REFERENCES `roles`(`id`),
  `business_id` text NOT NULL REFERENCES `businesses`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `devices` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `name` text NOT NULL,
  `platform` text DEFAULT 'windows' NOT NULL,
  `app_version` text DEFAULT '' NOT NULL,
  `location_id` text REFERENCES `locations`(`id`),
  `revoked` integer DEFAULT 0 NOT NULL,
  `last_seen_at` integer,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `token_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `revoked_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `user_id` text,
  `action` text NOT NULL,
  `entity` text NOT NULL,
  `entity_id` text,
  `details` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_settings` (
  `business_id` text NOT NULL REFERENCES `businesses`(`id`),
  `key` text NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `schema_meta` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL
);
