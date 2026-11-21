ALTER TABLE `sales` ADD COLUMN `order_type` text DEFAULT 'takeaway' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `waiter_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `service_charge_kobo` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `tip_kobo` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `account_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`opening_balance_kobo` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `accounts_business_name_unique` ON `accounts` (`business_id`,`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `accounts_business_idx` ON `accounts` (`business_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `account_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_kobo` integer NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`source_id` text,
	`user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_tx_account_created_idx` ON `account_transactions` (`account_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_tx_business_created_idx` ON `account_transactions` (`business_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_tx_source_idx` ON `account_transactions` (`source`,`source_id`);
