-- Batch 11: AI + WhatsApp automation.
-- One settings row per business (credentials never leave the machine) and a
-- small outbox so every message the app generated is auditable, including
-- "dry run" messages produced while WhatsApp is switched off.

CREATE TABLE IF NOT EXISTS `automation_settings` (
  `business_id` text PRIMARY KEY NOT NULL,
  `whatsapp_enabled` integer NOT NULL DEFAULT 0,
  `whatsapp_phone_id` text NOT NULL DEFAULT '',
  `whatsapp_token` text NOT NULL DEFAULT '',
  `whatsapp_to` text NOT NULL DEFAULT '',
  `ai_enabled` integer NOT NULL DEFAULT 0,
  `ai_base_url` text NOT NULL DEFAULT '',
  `ai_api_key` text NOT NULL DEFAULT '',
  `ai_model` text NOT NULL DEFAULT 'gpt-4o-mini',
  `low_stock_enabled` integer NOT NULL DEFAULT 0,
  `daily_summary_enabled` integer NOT NULL DEFAULT 0,
  `daily_summary_hour` integer NOT NULL DEFAULT 20,
  `last_low_stock_on` text NOT NULL DEFAULT '',
  `last_summary_on` text NOT NULL DEFAULT '',
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `automation_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `kind` text NOT NULL,
  `channel` text NOT NULL DEFAULT 'whatsapp',
  `to_address` text NOT NULL DEFAULT '',
  `body` text NOT NULL,
  `status` text NOT NULL DEFAULT 'queued',
  `error` text NOT NULL DEFAULT '',
  `created_at` integer NOT NULL,
  `sent_at` integer
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `automation_messages_business_created_idx`
  ON `automation_messages` (`business_id`, `created_at`);
