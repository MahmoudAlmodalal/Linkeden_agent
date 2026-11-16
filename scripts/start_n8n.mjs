import { spawn, spawnSync } from 'node:child_process';

// Render's Docker command resolver does not provide the image PATH. Use the
// absolute CLI path from the official n8n image instead of relying on PATH.
const n8n = '/usr/local/bin/n8n';

function runN8n(args, failureMessage) {
  const result = spawnSync(n8n, args, {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    console.warn(failureMessage);
    return false;
  }
  return true;
}

// n8n 1.x expects an array for --input unless --separate is used.
// The repository stores one exported workflow per JSON file.
runN8n(['import:workflow', '--separate', '--input=/workflows'], 'Workflow import failed');

// n8n 1.80+ activates imported workflows with publish:workflow.
// Do this before starting the server so its production webhook routes are ready.
runN8n(
  ['publish:workflow', '--id=workflow-1-staging'],
  'Staging workflow activation failed',
);
runN8n(
  ['publish:workflow', '--id=workflow-2-publishing'],
  'Telegram workflow activation failed',
);

// Ensure Telegram's webhook is registered with the current secret token.
const webhookRegistration = spawnSync('node', ['/scripts/register_telegram_webhook.mjs'], {
  env: process.env,
  stdio: 'inherit',
});
if (webhookRegistration.error || webhookRegistration.status !== 0) {
  console.warn('Telegram webhook registration skipped or failed');
}

const host = process.env.N8N_HOST || '0.0.0.0';
const port = process.env.PORT || process.env.N8N_PORT || '5678';
const child = spawn(n8n, ['start', '--host', host, '--port', port], {
  env: process.env,
  stdio: 'inherit',
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
