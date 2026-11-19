# WhatsApp and AI automation

Two optional features, both **off by default**, configured in
**Settings → WhatsApp & AI alerts**:

1. **WhatsApp delivery** of a low-stock alert and a daily sales summary.
2. **AI rewriting** of those messages through any OpenAI-compatible chat
   endpoint. If the AI call fails, the plain message is sent unchanged.

Nothing is ever sent while WhatsApp is off: every generated message lands in
the local outbox as a **Preview**, so an owner can see the exact wording first.

## What gets generated

| Kind            | Trigger                                    | Content                                                                               |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `low_stock`     | Once per calendar day, when enabled        | Up to eight items at or below their reorder level, with the remaining count           |
| `daily_summary` | Once per day at the configured hour (0–23) | Sales total and receipt count, gross profit, top seller and low-stock count for today |
| `test`          | **Send test**                              | Whatever is typed in the test box                                                     |

The low-stock digest needs products with a reorder level above zero; products
without one are never reported. Sales and profit come from the same report
engine as **Reports** (today, from midnight to now).

Scheduled work is not tied to message delivery: the outbox row is written
first, then delivered. A failed send is recorded as `failed` with Meta's error
text and never blocks the next run.

## WhatsApp setup

1. Create a Meta app with the WhatsApp product and note the **phone number id**
   and a **permanent access token**.
2. Add the recipient in international format (`2348012345678`).
3. Tick **Send through WhatsApp**, save, and press **Send test**.

The app calls `https://graph.facebook.com/v20.0/{phoneId}/messages` with the
token as a bearer credential. Plain text messages only reach a customer inside
the 24-hour service window (someone must have messaged the business number in
the last day). For unattended alerts, create a **message template** with a
single body variable and enter its name and language (`en`, `en_GB`, …) in
Settings. The alert text fills the variable. Template names may contain letters,
digits and underscores.

Both the token and the AI key are **write-only**: the API and the Settings page
only report whether one is saved (`whatsappTokenSet`, `aiApiKeySet`). A blank
field on save keeps the stored secret. Credentials live in `automation_settings`
in the local database and are never included in sync entities, backups metadata
or audit details.

## AI rewriting

Point **AI base URL** at an OpenAI-compatible root such as
`https://api.openai.com/v1` (the app appends `/chat/completions`). The request
uses `model` (`gpt-4o-mini` by default), `max_tokens: 220` and a system prompt
that asks for under 60 words, plain language, no emojis and unchanged facts.
Any non-2xx response, timeout (15 s) or malformed body silently falls back to
the deterministic text.

## Outbox

`automation_messages` keeps the newest 200 rows per business (older rows are
pruned). Statuses:

| Status    | Meaning                                              |
| --------- | ---------------------------------------------------- |
| `queued`  | Written, delivery not attempted yet                  |
| `sent`    | WhatsApp accepted it; `sent_at` is filled            |
| `failed`  | Meta or the network refused it; `error` explains why |
| `dry_run` | WhatsApp is off — preserved as a preview, never sent |

**Recent messages** in Settings shows the newest 20, newest first, with the
first line of the body and any delivery error.

## Scheduling

- Desktop app (primary mode): first tick after 90 seconds, then every 15
  minutes while the app is open.
- LAN server: first tick after 90 seconds, then every 15 minutes.

Both call `runAutomation` without forcing: the once-a-day guards in
`automation_settings` (`last_low_stock_on`, `last_summary_on`) prevent duplicate
alerts, and the summary waits for its configured hour. **Run now** bypasses both
guards for a manual check.

## Endpoints

All require `settings.manage` and a signed-in session:

| Route                           | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `GET /api/automation/settings`  | Redacted settings (`…TokenSet` / `…ApiKeySet` booleans)         |
| `POST /api/automation/settings` | Save; blank secrets keep the stored value                       |
| `GET /api/automation/messages`  | Outbox page (`?limit=`, 1–200, newest first)                    |
| `POST /api/automation/test`     | `{ body }` → one `test` message, delivered or previewed         |
| `POST /api/automation/run`      | Forced run; returns `{ queued, sent, failed, dryRun, skipped }` |

A successful queued run emits `automation.changed` over Socket.IO so open
desktops refresh the outbox.

## Database

- `automation_settings` — one row per business (migration `0009`).
- `automation_messages` — outbox with a `(business_id, created_at)` index.
- `0010_batch11_templates.sql` adds `whatsapp_template` and `whatsapp_lang`.

## Tests

```bash
cd packages/database
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run src/automation.test.ts

cd apps/local-server
ELECTRON_RUN_AS_NODE=1 ../desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

The database suite covers defaults and permissions, the digests, dry-run and
daily guards, text and template delivery (URL, bearer header, payload shape),
failure recording, AI fallback and newest-first ordering. The server suite
covers secret redaction, validation, the preview path and a forced run.
