import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isAuthorized,
  parseCommand,
  formatPreviewCaption,
  loadPendingDrafts,
  savePendingDrafts,
  getLatestPendingDraft,
  removePendingDraft,
  addPendingDraft,
  handleTelegramUpdate,
  sendPreviewMessage,
} from '../scripts/telegram_router.js';

describe('Telegram Security & Authorization', () => {
  const allowedId = '123456789';

  it('allows message from authorized user ID (exact match)', () => {
    assert.equal(isAuthorized({ from: { id: 123456789 } }, allowedId), true);
    assert.equal(isAuthorized({ from: { id: '123456789' } }, allowedId), true);
  });

  it('rejects message from unauthorized user ID', () => {
    assert.equal(isAuthorized({ from: { id: 987654321 } }, allowedId), false);
    assert.equal(isAuthorized({ from: { id: 'unauthorized_id' } }, allowedId), false);
  });

  it('rejects update with missing from or id', () => {
    assert.equal(isAuthorized({}, allowedId), false);
    assert.equal(isAuthorized({ from: null }, allowedId), false);
    assert.equal(isAuthorized({ from: {} }, allowedId), false);
    assert.equal(isAuthorized(null, allowedId), false);
  });

  it('uses process.env.TELEGRAM_ALLOWED_USER_ID when allowedId is not passed', () => {
    process.env.TELEGRAM_ALLOWED_USER_ID = '999888';
    assert.equal(isAuthorized({ from: { id: 999888 } }), true);
    assert.equal(isAuthorized({ from: { id: 111222 } }), false);
    delete process.env.TELEGRAM_ALLOWED_USER_ID;
  });
});

describe('Telegram Command Parsing', () => {
  it('parses /approve with numeric ID', () => {
    const result = parseCommand('/approve 42');
    assert.deepEqual(result, {
      command: 'approve',
      draftId: 42,
      raw: '/approve 42',
    });
  });

  it('parses /approve with hashtag prefix', () => {
    const result = parseCommand('/approve #42');
    assert.deepEqual(result, {
      command: 'approve',
      draftId: 42,
      raw: '/approve #42',
    });
  });

  it('parses /approve without ID', () => {
    const result = parseCommand('/approve');
    assert.deepEqual(result, {
      command: 'approve',
      draftId: null,
      raw: '/approve',
    });
  });

  it('parses /approve with bot mention e.g. /approve@bot_name 10', () => {
    const result = parseCommand('/approve@linkedin_post_bot 10');
    assert.deepEqual(result, {
      command: 'approve',
      draftId: 10,
      raw: '/approve@linkedin_post_bot 10',
    });
  });

  it('parses /reject with numeric ID', () => {
    const result = parseCommand('/reject 5');
    assert.deepEqual(result, {
      command: 'reject',
      draftId: 5,
      raw: '/reject 5',
    });
  });

  it('parses /reject with hashtag prefix', () => {
    const result = parseCommand('/reject #5');
    assert.deepEqual(result, {
      command: 'reject',
      draftId: 5,
      raw: '/reject #5',
    });
  });

  it('parses /reject without ID', () => {
    const result = parseCommand('/reject');
    assert.deepEqual(result, {
      command: 'reject',
      draftId: null,
      raw: '/reject',
    });
  });

  it('parses /generate command', () => {
    const result = parseCommand('/generate');
    assert.deepEqual(result, {
      command: 'generate',
      draftId: null,
      raw: '/generate',
    });
  });

  it('parses /drafts and /list commands', () => {
    assert.deepEqual(parseCommand('/drafts'), {
      command: 'drafts',
      draftId: null,
      raw: '/drafts',
    });
    assert.deepEqual(parseCommand('/list'), {
      command: 'drafts',
      draftId: null,
      raw: '/list',
    });
  });

  it('parses /help, /start, and /menu commands', () => {
    assert.deepEqual(parseCommand('/help'), {
      command: 'help',
      draftId: null,
      raw: '/help',
    });
    assert.deepEqual(parseCommand('/start'), {
      command: 'help',
      draftId: null,
      raw: '/start',
    });
  });

  it('parses callback query format e.g. approve:15 and reject:15', () => {
    assert.deepEqual(parseCommand('approve:15'), {
      command: 'approve',
      draftId: 15,
      raw: 'approve:15',
    });
    assert.deepEqual(parseCommand('reject:15'), {
      command: 'reject',
      draftId: 15,
      raw: 'reject:15',
    });
    assert.deepEqual(parseCommand('show:15'), {
      command: 'show',
      draftId: 15,
      raw: 'show:15',
    });
    assert.deepEqual(parseCommand('preview:15'), {
      command: 'show',
      draftId: 15,
      raw: 'preview:15',
    });
    assert.deepEqual(parseCommand('drafts'), {
      command: 'drafts',
      draftId: null,
      raw: 'drafts',
    });
  });

  it('parses canonical underscore callback data for draft actions', () => {
    assert.deepEqual(parseCommand('show_1'), { command: 'show', draftId: 1, raw: 'show_1' });
    assert.deepEqual(parseCommand('approve_2'), { command: 'approve', draftId: 2, raw: 'approve_2' });
    assert.deepEqual(parseCommand('reject_3'), { command: 'reject', draftId: 3, raw: 'reject_3' });
    assert.deepEqual(parseCommand('generate_new'), { command: 'generate', draftId: null, raw: 'generate_new' });
  });

  it('parses /show and /preview commands', () => {
    assert.deepEqual(parseCommand('/show 9'), {
      command: 'show',
      draftId: 9,
      raw: '/show 9',
    });
    assert.deepEqual(parseCommand('/preview 9'), {
      command: 'show',
      draftId: 9,
      raw: '/preview 9',
    });
  });

  it('parses interactive touch button labels in Arabic and English', () => {
    assert.equal(parseCommand('⚡ توليد مسودة جديدة (/generate)')?.command, 'generate');
    assert.equal(parseCommand('📋 عرض المسودات المعلقة (/drafts)')?.command, 'drafts');
    assert.equal(parseCommand('✅ نشر أحدث مسودة (/approve)')?.command, 'approve');
    assert.equal(parseCommand('🗑️ رفض مسودة (/reject)')?.command, 'reject');
    assert.equal(parseCommand('ℹ️ المساعدة والتعليمات (/help)')?.command, 'help');
  });

  it('returns unknown for unrecognized commands', () => {
    const result = parseCommand('/unknown_cmd 123');
    assert.deepEqual(result, {
      command: 'unknown',
      draftId: null,
      raw: '/unknown_cmd 123',
    });
  });

  it('returns null for empty or non-command text', () => {
    assert.equal(parseCommand(''), null);
    assert.equal(parseCommand(null), null);
    assert.equal(parseCommand('Hello bot'), null);
  });
});

describe('Preview Message Caption Formatting', () => {
  it('formats preview caption with Draft ID, post text, and action instructions', () => {
    const draft = {
      id: 3,
      text: 'Exploring Database Sharding vs Partitioning in high scale systems.\n\n#SystemDesign #Backend',
    };

    const caption = formatPreviewCaption(draft);

    assert.ok(caption.includes('[Draft ID: #3]'), 'Should contain formatted Draft ID');
    assert.ok(caption.includes(draft.text), 'Should contain full post text');
    assert.ok(caption.includes('/approve 3'), 'Should include approve command instruction');
    assert.ok(caption.includes('/reject 3'), 'Should include reject command instruction');
  });

  it('supports post_text or content property on draft object', () => {
    const draft = {
      id: 7,
      post_text: 'Arabic technical content: تجزئة قواعد البيانات وقابلية التوسع.',
    };

    const caption = formatPreviewCaption(draft);

    assert.ok(caption.includes('[Draft ID: #7]'));
    assert.ok(caption.includes(draft.post_text));
    assert.ok(caption.includes('/approve 7'));
    assert.ok(caption.includes('/reject 7'));
  });
});

describe('Draft Queue State Operations', () => {
  let tempDir;
  let testDraftsPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-router-test-'));
    testDraftsPath = path.join(tempDir, 'pending_drafts.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads pending drafts, handling missing file gracefully', () => {
    const drafts = loadPendingDrafts(testDraftsPath);
    assert.deepEqual(drafts, []);
  });

  it('adds and persists drafts to pending_drafts.json', () => {
    const draft1 = { id: 1, text: 'Post 1', image_path: 'assets/post1.png' };
    const draft2 = { id: 2, text: 'Post 2', image_path: 'assets/post2.png' };

    addPendingDraft(draft1, testDraftsPath);
    addPendingDraft(draft2, testDraftsPath);

    const loaded = loadPendingDrafts(testDraftsPath);
    assert.equal(loaded.length, 2);
    assert.deepEqual(loaded[0], draft1);
    assert.deepEqual(loaded[1], draft2);
  });

  it('gets the latest pending draft', () => {
    const draft1 = { id: 1, text: 'Post 1' };
    const draft2 = { id: 2, text: 'Post 2' };
    savePendingDrafts([draft1, draft2], testDraftsPath);

    const latest = getLatestPendingDraft(testDraftsPath);
    assert.deepEqual(latest, draft2);
  });

  it('returns null when getting latest draft from empty queue', () => {
    const latest = getLatestPendingDraft(testDraftsPath);
    assert.equal(latest, null);
  });

  it('removes a draft by ID from pending_drafts.json', () => {
    const draft1 = { id: 1, text: 'Post 1' };
    const draft2 = { id: 2, text: 'Post 2' };
    const draft3 = { id: 3, text: 'Post 3' };
    savePendingDrafts([draft1, draft2, draft3], testDraftsPath);

    const removed = removePendingDraft(2, testDraftsPath);
    assert.deepEqual(removed, draft2);

    const remaining = loadPendingDrafts(testDraftsPath);
    assert.equal(remaining.length, 2);
    assert.deepEqual(remaining.map((d) => d.id), [1, 3]);
  });

  it('returns null when removing a non-existent draft ID', () => {
    const draft1 = { id: 1, text: 'Post 1' };
    savePendingDrafts([draft1], testDraftsPath);

    const removed = removePendingDraft(99, testDraftsPath);
    assert.equal(removed, null);

    const remaining = loadPendingDrafts(testDraftsPath);
    assert.equal(remaining.length, 1);
  });
});

describe('Telegram Update Router (handleTelegramUpdate)', () => {
  let tempDir;
  let testDraftsPath;
  const allowedId = '445566';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-router-update-test-'));
    testDraftsPath = path.join(tempDir, 'pending_drafts.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocks updates from unauthorized users immediately', async () => {
    let workflowTriggered = false;
    const update = {
      message: {
        from: { id: 999999 },
        text: '/approve 1',
        chat: { id: 999999 },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
      triggerWorkflow1: async () => {
        workflowTriggered = true;
      },
    });

    assert.equal(response.authorized, false);
    assert.equal(response.status, 'blocked');
    assert.ok(response.message.toLowerCase().includes('unauthorized'));
    assert.equal(workflowTriggered, false);
  });

  it('answers callback queries immediately and routes underscore actions with their draft ID', async () => {
    savePendingDrafts([{ id: 1, text: 'Draft 1 preview' }], testDraftsPath);
    let apiCall;
    const update = {
      callback_query: {
        id: 'callback-query-abc',
        from: { id: allowedId },
        message: { chat: { id: allowedId } },
        data: 'show_1',
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
      botToken: 'test-token',
      fetch: async (url, init) => {
        apiCall = { url, init };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });

    assert.equal(apiCall.url, 'https://api.telegram.org/bottest-token/answerCallbackQuery');
    assert.equal(apiCall.init.method, 'POST');
    assert.deepEqual(JSON.parse(apiCall.init.body), { callback_query_id: 'callback-query-abc' });
    assert.equal(response.authorized, true);
    assert.equal(response.command, 'show');
    assert.equal(response.draft.id, 1);
  });

  it('handles /approve [id] with specified draft ID', async () => {
    const draft1 = { id: 1, text: 'Draft 1' };
    const draft2 = { id: 2, text: 'Draft 2' };
    savePendingDrafts([draft1, draft2], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/approve 1',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'approve');
    assert.equal(response.draft.id, 1);
    assert.ok(response.replyText.includes('approved'));
    assert.ok(response.replyText.includes('#1'));
  });

  it('handles /approve with omitted ID defaulting to latest draft', async () => {
    const draft1 = { id: 1, text: 'Draft 1' };
    const draft2 = { id: 2, text: 'Draft 2' };
    savePendingDrafts([draft1, draft2], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/approve',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'approve');
    assert.equal(response.draft.id, 2);
    assert.ok(response.replyText.includes('#2'));
  });

  it('handles /approve when no pending drafts exist', async () => {
    savePendingDrafts([], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/approve',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, false);
    assert.equal(response.command, 'approve');
    assert.ok(response.replyText.toLowerCase().includes('no pending draft'));
  });

  it('handles /reject [id] removing draft from pending_drafts.json and confirming', async () => {
    const draft1 = { id: 1, text: 'Draft 1' };
    const draft2 = { id: 2, text: 'Draft 2' };
    savePendingDrafts([draft1, draft2], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/reject 1',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'reject');
    assert.equal(response.draftId, 1);
    assert.ok(response.replyText.includes('#1'));
    assert.ok(response.replyText.toLowerCase().includes('rejected'));

    const remaining = loadPendingDrafts(testDraftsPath);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 2);
  });

  it('handles /reject without ID returning a helpful error message', async () => {
    const update = {
      message: {
        from: { id: allowedId },
        text: '/reject',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, false);
    assert.equal(response.command, 'reject');
    assert.ok(response.replyText.includes('/reject <id>'));
  });

  it('handles /reject for non-existent ID gracefully', async () => {
    const update = {
      message: {
        from: { id: allowedId },
        text: '/reject 999',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, false);
    assert.equal(response.command, 'reject');
    assert.ok(response.replyText.includes('999'));
    assert.ok(response.replyText.toLowerCase().includes('not found'));
  });

  it('handles /generate triggering Workflow 1 staging run immediately', async () => {
    let triggered = false;
    let payloadPassed = null;

    const update = {
      message: {
        from: { id: allowedId },
        text: '/generate',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
      triggerWorkflow1: async (payload) => {
        triggered = true;
        payloadPassed = payload;
        return { ok: true };
      },
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'generate');
    assert.equal(triggered, true);
    assert.ok(response.replyText.toLowerCase().includes('trigger') || response.replyText.toLowerCase().includes('generat'));
  });

  it('handles /drafts when pending drafts exist, returning inline buttons', async () => {
    savePendingDrafts([
      { id: 1, text: 'Draft 1 content', topic: 'Sharding' },
      { id: 2, text: 'Draft 2 content', topic: 'Caching' },
    ], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/drafts',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'drafts');
    assert.equal(response.drafts.length, 2);
    assert.ok(response.inlineKeyboard.length >= 2);
    assert.deepEqual(response.inlineKeyboard[0].map((button) => button.callback_data), ['show_1', 'approve_1', 'reject_1']);
    assert.equal(response.inlineKeyboard.at(-1)[0].callback_data, 'generate_new');
    assert.ok(response.replyMarkup && (response.replyMarkup.keyboard || response.replyMarkup.remove_keyboard));
  });

  it('handles /drafts when queue is empty', async () => {
    savePendingDrafts([], testDraftsPath);

    const update = {
      message: {
        from: { id: allowedId },
        text: '/drafts',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'drafts');
    assert.equal(response.drafts.length, 0);
    assert.ok(response.replyText.includes('لا توجد'));
  });

  it('handles /help command returning full command catalog and keyboard', async () => {
    const update = {
      message: {
        from: { id: allowedId },
        text: '/help',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, true);
    assert.equal(response.command, 'help');
    assert.ok(response.replyText.includes('/generate'));
    assert.ok(response.replyText.includes('/drafts'));
    assert.ok(response.replyMarkup && (response.replyMarkup.keyboard || response.replyMarkup.remove_keyboard));
  });

  it('handles unknown commands with a helpful help message', async () => {
    const update = {
      message: {
        from: { id: allowedId },
        text: '/foobar',
        chat: { id: allowedId },
      },
    };

    const response = await handleTelegramUpdate(update, {
      allowedUserId: allowedId,
      pendingDraftsPath: testDraftsPath,
    });

    assert.equal(response.authorized, true);
    assert.equal(response.success, false);
    assert.equal(response.command, 'unknown');
    assert.ok(response.replyText.includes('/approve'));
    assert.ok(response.replyText.includes('/reject'));
    assert.ok(response.replyText.includes('/generate'));
  });
});

describe('Preview Dispatcher (sendPreviewMessage)', () => {
  it('prepares Telegram sendPhoto payload and calls mock client', async () => {
    let dispatchedPayload = null;
    const mockClient = {
      sendPhoto: async (payload) => {
        dispatchedPayload = payload;
        return { message_id: 101, ok: true };
      },
    };

    const draft = {
      id: 5,
      text: 'Deep dive into event-driven architectures with Kafka and RabbitMQ.',
      image_path: 'assets/kafka_diagram.png',
    };

    const result = await sendPreviewMessage(draft, {
      chatId: '123456789',
      client: mockClient,
    });

    assert.equal(result.ok, true);
    assert.equal(dispatchedPayload.chat_id, '123456789');
    assert.equal(dispatchedPayload.photo, 'assets/kafka_diagram.png');
    assert.ok(dispatchedPayload.caption.includes('[Draft ID: #5]'));
    assert.ok(dispatchedPayload.caption.includes('/approve 5'));
  });
});

describe('Workflow 1 Staging Specification Validation', () => {
  const workflowPath = path.resolve('workflows/workflow_1_staging.json');

  it('verifies workflow_1_staging.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(workflowPath), 'Workflow 1 file must exist');
    const raw = fs.readFileSync(workflowPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(data.nodes && Array.isArray(data.nodes));
    assert.ok(data.connections && typeof data.connections === 'object');
  });

  it('contains Cron schedule trigger with 0 10 * * 0-4', () => {
    const data = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const cronNode = data.nodes.find(
      (n) =>
        n.type === 'n8n-nodes-base.scheduleTrigger' ||
        n.type === 'n8n-nodes-base.cron'
    );
    assert.ok(cronNode, 'Schedule trigger node must exist');
    const interval = cronNode.parameters?.rule?.interval || [];
    const cronRule = interval.find((r) => r.expression === '0 10 * * 0-4');
    assert.ok(cronRule, 'Cron schedule must be 0 10 * * 0-4');
  });

  it('contains Webhook trigger for /generate', () => {
    const data = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const webhookNode = data.nodes.find(
      (n) => n.type === 'n8n-nodes-base.webhook'
    );
    assert.ok(webhookNode, 'Webhook trigger node must exist');
    assert.equal(webhookNode.parameters?.path, 'generate');
  });

  it('contains Code nodes for topic selection and Gemini generation', () => {
    const data = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const codeNodes = data.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
    assert.ok(codeNodes.length >= 2, 'Should have at least 2 code nodes');

    const topicNode = codeNodes.find((n) => n.name.toLowerCase().includes('topic'));
    assert.ok(topicNode, 'Must have topic selection code node');

    const geminiNode = codeNodes.find((n) =>
      n.name.toLowerCase().includes('gemini') || n.name.toLowerCase().includes('generation')
    );
    assert.ok(geminiNode, 'Must have Gemini generation code node');
  });

  it('contains Telegram send photo node configured with TELEGRAM_ALLOWED_USER_ID', () => {
    const data = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const telegramNode = data.nodes.find(
      (n) => n.type === 'n8n-nodes-base.telegram'
    );
    assert.ok(telegramNode, 'Telegram node must exist');
    assert.equal(telegramNode.parameters?.operation, 'sendPhoto');
    assert.ok(
      telegramNode.parameters?.chatId?.includes('TELEGRAM_ALLOWED_USER_ID'),
      'Chat ID parameter must reference TELEGRAM_ALLOWED_USER_ID'
    );
  });
});
