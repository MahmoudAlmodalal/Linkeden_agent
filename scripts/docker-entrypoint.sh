#!/bin/sh
set -eu

# Import repository workflows into the n8n database before the server starts.
# The official n8n image provides the `n8n` command on PATH inside this script.
for workflow in /workflows/workflow_1_staging.json /workflows/workflow_2_publishing.json; do
  if [ -s "$workflow" ]; then
    n8n import:workflow --input="$workflow" || echo "Workflow import skipped: $workflow"
  fi
done

# n8n 2.x registers production webhooks when a workflow is published.
n8n publish:workflow --id=workflow-1-staging || echo "Staging workflow publish skipped"
n8n publish:workflow --id=workflow-2-publishing || echo "Telegram workflow publish skipped"

# Explicitly subscribe to callback_query updates as well as normal messages.
# Telegram can retain an older allowed_updates filter after bot configuration changes.
node /scripts/register_telegram_webhook.mjs || echo "Telegram webhook registration skipped or failed"

# Preserve the official image's normal startup arguments and signal handling.
if [ "$#" -gt 0 ]; then
  exec n8n "$@"
else
  exec n8n start
fi
