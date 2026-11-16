#!/bin/sh
set -eu

# Import individual workflow JSON exports with the n8n 1.x --separate mode.
n8n import:workflow --separate --input=/workflows || echo "Workflow import failed"

# Activate workflows before the n8n server starts and registers production webhooks.
n8n publish:workflow --id=workflow-1-staging || echo "Staging workflow activation failed"
n8n publish:workflow --id=workflow-2-publishing || echo "Telegram workflow activation failed"

node /scripts/register_telegram_webhook.mjs || echo "Telegram webhook registration skipped or failed"
exec n8n start --host "${N8N_HOST:-0.0.0.0}" --port "${PORT:-${N8N_PORT:-5678}}"
