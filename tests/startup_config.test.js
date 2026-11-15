import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startupFiles = [
  'scripts/docker-entrypoint.sh',
  'scripts/start_n8n.sh',
  'scripts/start_n8n.mjs',
];

test('startup scripts import separate workflow JSON files using n8n 1.x syntax', () => {
  for (const relativePath of startupFiles) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    assert.match(source, /import:workflow/);
    assert.match(source, /--separate/);
    assert.match(source, /--input(?:=|['", ])\/workflows/);
    assert.doesNotMatch(source, /['"]publish:workflow['"]/);
  }
});

test('startup scripts activate both repository workflows before serving Telegram updates', () => {
  for (const relativePath of startupFiles) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    assert.match(source, /update:workflow/);
    assert.match(source, /workflow-1-staging/);
    assert.match(source, /workflow-2-publishing/);
    assert.match(source, /--active=true/);
  }
});

test('scripts are ESM in the container and can resolve dependencies installed in /app', () => {
  const scriptsPackage = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'scripts/package.json'), 'utf8'),
  );
  const dockerfile = fs.readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
  assert.equal(scriptsPackage.type, 'module');
  assert.match(dockerfile, /COPY \.\/scripts \/scripts/);
  assert.match(dockerfile, /ln -s \/app\/node_modules \/scripts\/node_modules/);
});

test('startup diagnostics report provider-key presence without exposing values', () => {
  const entrypoint = fs.readFileSync(path.join(projectRoot, 'scripts/docker-entrypoint.sh'), 'utf8');
  for (const key of ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    assert.ok(entrypoint.includes(key));
  }
  assert.match(entrypoint, /process\.env\[key\] \? "set" : "missing"/);
});

test('workflow exports are single workflow objects with stable IDs', () => {
  const expected = [
    ['workflows/workflow_1_staging.json', 'workflow-1-staging'],
    ['workflows/workflow_2_publishing.json', 'workflow-2-publishing'],
  ];
  for (const [relativePath, id] of expected) {
    const workflow = JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
    assert.equal(Array.isArray(workflow), false);
    assert.equal(workflow.id, id);
    assert.ok(Array.isArray(workflow.nodes));
    assert.equal(typeof workflow.connections, 'object');
  }
});
