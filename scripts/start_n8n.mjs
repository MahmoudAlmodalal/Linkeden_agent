import { spawn, spawnSync } from 'node:child_process';

// Render's Docker command resolver does not provide the image PATH. Use the
// absolute CLI path from the official n8n image instead of relying on PATH.
const n8n = '/usr/local/bin/n8n';

const workflows = [
  '/workflows/workflow_1_staging.json',
  '/workflows/workflow_2_publishing.json',
];

for (const workflow of workflows) {
  const result = spawnSync(n8n, ['import:workflow', `--input=${workflow}`], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error || result.status !== 0) {
    console.warn(`Workflow import skipped or failed for ${workflow}`);
  }
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
