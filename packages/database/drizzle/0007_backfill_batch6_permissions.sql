-- Batch 6 permissions added after some installations were already set up.
-- New businesses get these from runSetup; this backfills existing databases so
-- the Customers, Suppliers and Purchases pages appear after upgrading.
INSERT OR IGNORE INTO `permissions` (`key`, `description`) VALUES
('purchases.manage', 'Manage purchase orders and receiving'),
('customers.manage', 'Manage customers and credit'),
('suppliers.manage', 'Manage suppliers');
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_key`)
SELECT r.`id`, p.`key`
FROM `roles` r
JOIN `permissions` p
  ON p.`key` IN ('purchases.manage', 'customers.manage', 'suppliers.manage')
WHERE r.`is_system` = 1
  AND r.`name` IN ('Administrator', 'Manager')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`role_id` = r.`id` AND rp.`permission_key` = p.`key`
  );
