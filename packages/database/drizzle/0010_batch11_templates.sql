-- Meta only allows free-form text inside a 24-hour service window. Outside it a
-- pre-approved template is required; the alert text fills its single body
-- variable. Both settings are optional and empty means "send plain text".

ALTER TABLE `automation_settings` ADD COLUMN `whatsapp_template` text NOT NULL DEFAULT '';
--> statement-breakpoint

ALTER TABLE `automation_settings` ADD COLUMN `whatsapp_lang` text NOT NULL DEFAULT 'en';
