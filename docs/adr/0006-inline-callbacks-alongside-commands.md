# Inline Callbacks Alongside Text Commands

ADR 0001 chose text commands (`/approve`, `/reject`) over n8n Wait-on-Webhook. Staging now also sends an inline keyboard with each draft (`callback_data: approve_<id>` / `reject_<id>`, see `workflows/workflow_1_staging.json`).

Callbacks are **not** n8n Wait nodes: they hit the same Telegram webhook, are parsed by `scripts/telegram_router.js` (underscore format canonical, colon format accepted), and call the same approve/reject handlers as the commands, behind the same user-ID and webhook-secret checks. The queue stays stateless between messages, so the resilience argument of ADR 0001 still holds.

**Why:** one tap on mobile is faster than typing a command.
**Cost:** two input paths to keep in sync; the router tests cover both.
