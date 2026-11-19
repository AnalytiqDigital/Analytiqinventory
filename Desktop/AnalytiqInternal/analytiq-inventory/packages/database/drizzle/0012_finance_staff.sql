CREATE TABLE IF NOT EXISTS `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`location_id` text,
	`category` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`amount_kobo` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`created_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `expenses_business_paid_idx` ON `expenses` (`business_id`,`paid_at`);
--> statement-breakpoint
INSERT INTO `permissions` (`key`, `description`)
VALUES ('finance.manage', 'Record expenses and view profit statements')
ON CONFLICT(`key`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_key`)
SELECT r.`id`, 'finance.manage'
  FROM `roles` r
 WHERE r.`name` IN ('Administrator', 'Manager')
   AND NOT EXISTS (
     SELECT 1 FROM `role_permissions` rp
      WHERE rp.`role_id` = r.`id` AND rp.`permission_key` = 'finance.manage'
   );
