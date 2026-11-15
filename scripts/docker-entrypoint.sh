#!/bin/sh
set -eu

export NODE_PATH="${NODE_PATH:-/app/node_modules}"

# Report key presence only; never print secret values to Render logs.
node -e 'for (const key of ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) console.log("[config-check] " + key + ": " + (process.env[key] ? "set" : "missing"))'

# n8n 1.x expects an array for --input unless --separate is used.
# These repository files are individual workflow exports, so import the directory.
if [ -d /workflows ]; then
  n8n import:workflow --separate --input=/workflows || echo "Workflow import failed"
fi

# n8n 1.80 uses update:workflow to activate imported workflows.
# Run this before starting n8n so active webhook routes are registered at startup.
n8n update:workflow --id=workflow-1-staging --active=true || echo "Staging workflow activation failed"
n8n update:workflow --id=workflow-2-publishing --active=true || echo "Telegram workflow activation failed"

# Explicitly subscribe to callback_query updates as well as normal messages.
# Telegram can retain an older allowed_updates filter after bot configuration changes.
node /scripts/register_telegram_webhook.mjs || echo "Telegram webhook registration skipped or failed"

# Preserve the official image's normal startup arguments and signal handling.
if [ "$#" -gt 0 ]; then
  exec n8n "$@"
else
  exec n8n start
fi
