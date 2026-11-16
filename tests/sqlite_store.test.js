import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleTelegramUpdate, loadPendingDrafts, loadScenarios, getUserState } from '../scripts/telegram_router.js';
import { allocateDraftId } from '../scripts/draft_store.js';

const allowedUserId = '4242';
const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts');

describe('SQLite store behind the Telegram handler', () => {
  let dir;
  let draftsPath;
  let statePath;
  let scenariosPath;
  const send = (text, extra = {}) =>
    handleTelegramUpdate(
      { message: { from: { id: allowedUserId }, chat: { id: allowedUserId }, text } },
      {
        allowedUserId,
        pendingDraftsPath: draftsPath,
        botStatePath: statePath,
        scenariosPath,
        sendMessage: async () => ({ ok: true }),
        triggerWorkflow1: async () => {},
        ...extra,
      },
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-store-'));
    draftsPath = path.join(dir, 'pending_drafts.json');
    statePath = path.join(dir, 'bot_state.json');
    scenariosPath = path.join(dir, 'scenarios.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('imports legacy JSON once with Draft IDs preserved, leaving the JSON as backup', async () => {
    const legacy = [
      { id: 7, text: 'old seven', project: 'p' },
      { id: 9, text: 'old nine', project: 'p' },
    ];
    fs.writeFileSync(draftsPath, JSON.stringify(legacy));
    fs.writeFileSync(scenariosPath, JSON.stringify([{ id: 1, situation: 's' }]));
    fs.writeFileSync(statePath, JSON.stringify({ [allowedUserId]: { state: 'awaiting_situation' } }));

    assert.deepEqual(loadPendingDrafts(draftsPath).map((d) => d.id), [7, 9]);
    assert.equal(loadScenarios(scenariosPath).length, 1);
    assert.equal(getUserState(allowedUserId, statePath).state, 'awaiting_situation');
    assert.ok(fs.existsSync(path.join(dir, 'linkedin_agent.db')));

    // Importing again must not duplicate or reset anything.
    assert.deepEqual(loadPendingDrafts(draftsPath).map((d) => d.id), [7, 9]);
  });

  it('never reuses a Draft ID after the latest draft is rejected', async () => {
    fs.writeFileSync(draftsPath, JSON.stringify([{ id: 1, text: 'one' }, { id: 2, text: 'two' }]));
    assert.equal(await allocateDraftId(draftsPath), 3);
    await send('/reject 2');
    assert.deepEqual(loadPendingDrafts(draftsPath).map((d) => d.id), [1]);
    assert.equal(await allocateDraftId(draftsPath), 4);
  });

  it('keeps Reviewer State across a handler restart (fresh process)', async () => {
    await send('/situation');
    assert.equal(getUserState(allowedUserId, statePath).state, 'awaiting_situation');

    const probe = `
      import { getUserState } from ${JSON.stringify(path.join(scriptsDir, 'telegram_router.js'))};
      console.log(JSON.stringify(getUserState(${JSON.stringify(allowedUserId)}, ${JSON.stringify(statePath)})));
    `;
    const out = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', probe], { env: { ...process.env, NODE_ENV: 'test' } });
      let stdout = '';
      child.stdout.on('data', (c) => (stdout += c));
      child.on('error', reject);
      child.on('close', () => resolve(stdout));
    });
    assert.equal(JSON.parse(out).state, 'awaiting_situation');
  });

  it('allocates unique sequential Draft IDs across concurrent processes', async () => {
    const worker = `
      import { allocateDraftId } from ${JSON.stringify(path.join(scriptsDir, 'draft_store.js'))};
      const ids = [];
      for (let i = 0; i < 10; i++) ids.push(await allocateDraftId(${JSON.stringify(draftsPath)}));
      console.log(JSON.stringify(ids));
    `;
    const run = () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', worker]);
        let stdout = '';
        child.stdout.on('data', (c) => (stdout += c));
        child.on('error', reject);
        child.on('close', () => resolve(JSON.parse(stdout)));
      });
    const results = (await Promise.all([run(), run(), run(), run()])).flat();
    assert.equal(new Set(results).size, 40);
    assert.deepEqual([...results].sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
  });
});
