-- Setup revamp: State + LGA columns on businesses and locations.
ALTER TABLE `businesses` ADD `state` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `businesses` ADD `lga` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `locations` ADD `state` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `locations` ADD `lga` text DEFAULT '' NOT NULL;
