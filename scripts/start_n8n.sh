#!/bin/sh
set -eu

# Render builds the image from the repository, but n8n does not import JSON
# workflow files merely because they are copied into the container.
for workflow in /workflows/workflow_1_staging.json /workflows/workflow_2_publishing.json; do
  if [ -f "$workflow" ]; then
    echo "Importing n8n workflow: $workflow"
    n8n import:workflow --input="$workflow"
  fi
done

exec n8n start --host "${N8N_HOST:-0.0.0.0}" --port "${PORT:-${N8N_PORT:-5678}}"
