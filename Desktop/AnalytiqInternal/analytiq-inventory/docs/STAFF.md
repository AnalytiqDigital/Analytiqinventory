# Staff and permissions

The **Staff & Permissions** page manages who can sign in and what each role
may do. Only accounts holding `staff.manage` can open it; the seeded
Administrator role has it.

## Model

- Three locked roles: **Administrator**, **Manager**, **Cashier**. New roles
  cannot be created, so a typo can never strand a till without permissions.
- Each role's permission set is editable; changes apply to existing users on
  their next request (the session carries no cached grants).
- A user belongs to one role per business. Deactivating an account signs the
  person out and blocks login; history keeps their name on past sales.

## Permission keys

| Key                 | Meaning                                    |
| ------------------- | ------------------------------------------ |
| `sales.create`      | Create sales at the POS                    |
| `sales.refund`      | Refund completed sales                     |
| `sales.view`        | View sales history                         |
| `products.manage`   | Create, edit and archive products          |
| `inventory.adjust`  | Post stock adjustments and counts          |
| `inventory.view`    | View stock levels and movements            |
| `purchases.manage`  | Manage purchase orders and receiving       |
| `customers.manage`  | Manage customers and credit                |
| `suppliers.manage`  | Manage suppliers                           |
| `reports.view`      | View reports and the dashboard             |
| `finance.manage`    | Record expenses and view profit statements |
| `staff.manage`      | Manage users, roles and permissions        |
| `settings.manage`   | Manage business and application settings   |

Defaults: Cashier gets `sales.create`, `sales.view`, `inventory.view`;
Manager adds everything except staff and settings management; Administrator
has everything.

## Lock-out guards

- You cannot deactivate yourself or change your own role.
- Removing `staff.manage` from the last active staff-managing account is
  refused (`LAST_STAFF_MANAGER`).
- You cannot remove `staff.manage` from a role you hold yourself
  (`CANNOT_LOCK_SELF_OUT`).
- The Administrator role always keeps `staff.manage` and `settings.manage`.

## Passwords

- New accounts need at least 8 characters.
- **Reset password** sets a new one and revokes every active session for that
  user. Five failed logins lock the account for 15 minutes (unchanged).

## Where it runs

| Mode              | Entry points                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| Desktop (primary) | IPC `staff:list`, `staff:create`, `staff:update`, `staff:reset-password`, `staff:roles`, `staff:role-permissions` |
| LAN server        | `GET/POST/PATCH /api/staff`, `POST /api/staff/:id/password`, `GET /api/staff/roles`, `PATCH /api/staff/roles/:id` |
| Service           | `packages/database/src/staff.ts`                                                   |

Every route and IPC handler re-checks `staff.manage` inside the service.
Audit entries: `staff.create`, `staff.update`, `staff.password_reset`,
`roles.permissions_update`.

## Tests

`packages/database/src/batch14.test.ts` covers creation, duplicate email,
password reset with session revocation, self-deactivation guards, role edits
taking effect, and the Administrator lock. `apps/local-server/src/server.test.ts`
exercises the same flows over HTTP, including a cashier being refused sales
after `sales.create` is removed from the Cashier role.
