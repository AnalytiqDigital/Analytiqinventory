-- Batch 8: multi-branch sync state and the relay change log.
-- `sync_state` holds per-business cursors and connection settings; every
-- installation has it, so a client and a hub run the same schema.
-- `sync_records` is the relay's snapshot log: one row per entity, newest wins,
-- with a monotonic `seq` so clients can pull incrementally.

CREATE TABLE IF NOT EXISTS `sync_state` (
  `business_id` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`business_id`, `key`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sync_records` (
  `business_id` text NOT NULL,
  `entity` text NOT NULL,
  `entity_id` text NOT NULL,
  `version` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `seq` integer NOT NULL,
  `data` text NOT NULL,
  PRIMARY KEY (`business_id`, `entity`, `entity_id`)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `sync_records_business_seq_idx`
  ON `sync_records` (`business_id`, `seq`);
