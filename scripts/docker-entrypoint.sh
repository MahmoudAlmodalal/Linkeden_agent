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
n8n publish:workflow --id=workflow-2-publishing || echo "Telegram workflow publish skipped"

# Preserve the official image's normal startup arguments and signal handling.
exec n8n "$@"
