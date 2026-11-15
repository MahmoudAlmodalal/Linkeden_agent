import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, 'workflows', 'workflow_2_publishing.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

function runParser(callbackData, userId = 445566) {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  assert.ok(parserCode, 'workflow parser code should be present');
  const execute = new Function('$input', parserCode);
  return execute({
    item: {
      json: {
        body: {
          callback_query: {
            id: 'test-callback-id',
            from: { id: userId },
            message: { chat: { id: userId } },
            data: callbackData,
          },
        },
        allowedTelegramUserId: String(userId),
      },
    },
  })[0].json;
}

test('generate callback uses an awaited Workflow 1 trigger and reports failures', () => {
  const code = nodes.get('Handle Generate Node')?.parameters?.jsCode || '';
  assert.doesNotMatch(code, /wget|child_process|execSync|fetch|AbortSignal/);
  assert.match(code, /await\s+triggerGenerateWorkflow/);
  assert.match(code, /require\('http'\)/);
  assert.match(code, /path: '\/webhook\/generate'/);
  assert.match(code, /if \(result\.status < 200 \|\| result\.status >= 300\)/);
  assert.match(code, /❌ \*تعذر تشغيل Workflow 1/);
});

test('workflow 1 returns error item and does not persist silent fallback draft on failure', () => {
  const workflowPath = path.join(repoRoot, 'workflows', 'workflow_1_staging.json');
  const staging = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const code = staging.nodes.find((node) => node.name === 'Gemini Generation & Visual Stager')?.parameters?.jsCode || '';
  assert.doesNotMatch(code, /استخدام DB::transaction وحده/);
  assert.doesNotMatch(code, /visual_source: 'local_fallback'/);
  assert.match(code, /فشل توليد المسودة/);
});

test('draft list buttons use explicit callback_data action IDs', () => {
  const code = nodes.get('Handle Drafts Node')?.parameters?.jsCode || '';
  assert.match(code, /callback_data: `show_\$\{d\.id\}`/);
  assert.match(code, /callback_data: `approve_\$\{d\.id\}`/);
  assert.match(code, /callback_data: `reject_\$\{d\.id\}`/);
  assert.match(code, /callback_data: 'generate_new'/);
});

test('workflow parser maps each callback action and extracts the draft ID', () => {
  assert.deepEqual(
    ['show_1', 'approve_12', 'reject_3', 'generate_new'].map((data) => runParser(data)),
    [
      { authorized: true, command: 'show', draftId: '1', chatId: 445566, rawText: 'show_1' },
      { authorized: true, command: 'approve', draftId: '12', chatId: 445566, rawText: 'approve_12' },
      { authorized: true, command: 'reject', draftId: '3', chatId: 445566, rawText: 'reject_3' },
      { authorized: true, command: 'generate', draftId: null, chatId: 445566, rawText: 'generate_new' },
    ],
  );
});

test('webhook has a registered callback-query acknowledgement path', () => {
  const webhookLinks = workflow.connections['Telegram Webhook Trigger']?.main?.[0] || [];
  assert.ok(webhookLinks.some((link) => link.node === 'Is Telegram Callback Query?'));

  const checkNode = nodes.get('Is Telegram Callback Query?');
  assert.equal(checkNode?.type, 'n8n-nodes-base.if');
  assert.match(checkNode?.parameters?.conditions?.conditions?.[0]?.leftValue || '', /callback_query/);

  const checkLinks = workflow.connections['Is Telegram Callback Query?']?.main || [];
  assert.equal(checkLinks[0]?.[0]?.node, 'Answer Telegram Callback Query');

  const answerNode = nodes.get('Answer Telegram Callback Query');
  assert.equal(answerNode?.type, 'n8n-nodes-base.httpRequest');
  assert.match(answerNode?.parameters?.url || '', /answerCallbackQuery/);
  assert.equal(answerNode?.parameters?.bodyParameters?.parameters?.[0]?.name, 'callback_query_id');
});

test('approval publishing reads mounted drafts and sends unparsed Telegram replies', () => {
  const code = nodes.get('LinkedIn Publishing Node')?.parameters?.jsCode || '';
  assert.ok(code.includes("cwd: '/', encoding: 'utf8'"));
  const replyParameters = nodes.get('Telegram Reply Node')?.parameters?.bodyParameters?.parameters || [];
  assert.doesNotMatch(JSON.stringify(replyParameters), /parse_mode/);
});

test('show callback returns image binary and sends it through Telegram multipart upload', () => {
  const showCode = nodes.get('Handle Show Node')?.parameters?.jsCode || '';
  assert.doesNotMatch(showCode, /child_process|execSync/);
  assert.match(showCode, /replyText/);
  const showLinks = workflow.connections['Handle Show Node']?.main?.[0] || [];
  assert.deepEqual(showLinks.map((link) => link.node), ['Telegram Preview Photo Node']);
  assert.equal(
    workflow.connections['Telegram Preview Photo Node']?.main?.[0]?.[0]?.node,
    'Telegram Preview Reply Node',
  );
  assert.equal(nodes.get('Telegram Preview Reply Node')?.type, 'n8n-nodes-base.httpRequest');
  assert.doesNotMatch(
    JSON.stringify(nodes.get('Telegram Preview Reply Node')?.parameters?.bodyParameters?.parameters || []),
    /parse_mode/,
  );
  assert.match(
    JSON.stringify(nodes.get('Telegram Preview Reply Node')?.parameters?.bodyParameters?.parameters || []),
    /Handle Show Node/,
  );
  const photoNode = nodes.get('Telegram Preview Photo Node');
  assert.equal(photoNode?.type, 'n8n-nodes-base.httpRequest');
  assert.match(photoNode?.parameters?.url || '', /sendPhoto/);
  assert.equal(photoNode?.parameters?.contentType, 'multipart-form-data');
  assert.equal(photoNode?.parameters?.bodyParameters?.parameters?.[2]?.parameterType, 'formBinaryData');
  assert.equal(photoNode?.parameters?.bodyParameters?.parameters?.[2]?.inputDataFieldName, 'photo');

  const fakeFs = {
    existsSync: (file) => file === '/data/pending_drafts.json' || file === '/data/generated_images/post.png',
    statSync: () => ({ isFile: () => true, size: 256 }),
    readFileSync: (file, encoding) => file === '/data/pending_drafts.json'
      ? JSON.stringify([{ id: 7, text: 'Preview body', image_path: '/data/generated_images/post.png' }])
      : Buffer.from('fake-image-bytes'),
  };
  const execute = new Function('$', 'require', showCode);
  const result = execute(
    () => ({ first: () => ({ json: { chatId: 12345, draftId: '7' } }) }),
    (name) => {
      if (name === 'fs') return fakeFs;
      if (name === 'path') return path;
      throw new Error(`Unexpected module: ${name}`);
    },
  )[0];

  assert.equal(result.json.chatId, 12345);
  assert.match(result.json.replyText, /Preview body/);
  assert.match(result.json.replyText, /#7/);
  assert.equal(result.json.hasImage, true);
  assert.equal(result.json.replyMarkup.inline_keyboard[0][0].callback_data, 'approve_7');
  assert.equal(result.json.replyMarkup.inline_keyboard[0][1].callback_data, 'reject_7');
  assert.equal(result.binary.photo.fileName, 'post.png');
  assert.equal(result.binary.photo.mimeType, 'image/png');
  assert.equal(Buffer.from(result.binary.photo.data, 'base64').toString(), 'fake-image-bytes');
});

test('workflow 2 parser parses /situation with argument directly as generate with situation', () => {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  const execute = new Function('$input', 'require', parserCode);
  const result = execute({
    item: {
      json: {
        body: {
          message: {
            from: { id: 445566 },
            chat: { id: 445566 },
            text: '/situation Race condition in payment balance deduction',
          },
        },
        allowedTelegramUserId: '445566',
      },
    },
  }, (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)))[0].json;

  assert.equal(result.authorized, true);
  assert.equal(result.command, 'generate');
  assert.equal(result.situation, 'Race condition in payment balance deduction');
});

test('workflow 2 generate node forwards situation and query in payload to /webhook/generate', () => {
  const code = nodes.get('Handle Generate Node')?.parameters?.jsCode || '';
  assert.match(code, /payloadObj\.situation\s*=\s*situation/);
  assert.match(code, /payloadObj\.query\s*=\s*query/);
  assert.match(code, /path:\s*'\/webhook\/generate'/);
});

test('workflow 1 Gemini Generation & Visual Stager code compiles without syntax errors', () => {
  const stagingPath = path.join(repoRoot, 'workflows', 'workflow_1_staging.json');
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
  const code = staging.nodes.find((node) => node.name === 'Gemini Generation & Visual Stager')?.parameters?.jsCode || '';
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction('$input', '$env', 'require', code));
  assert.ok(staging.nodes.some((node) => node.name === 'Has Generated Photo?'));
});

test('workflow 2 parser parses /reject, /delete, and Arabic حذف commands', () => {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  const execute = new Function('$input', 'require', parserCode);
  const parseMsg = (text) => execute({
    item: {
      json: {
        body: {
          message: {
            from: { id: 445566 },
            chat: { id: 445566 },
            text,
          },
        },
        allowedTelegramUserId: '445566',
      },
    },
  }, (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)))[0].json;

  assert.equal(parseMsg('/reject 123').command, 'reject');
  assert.equal(parseMsg('/reject 123').draftId, '123');
  assert.equal(parseMsg('/delete #45').command, 'reject');
  assert.equal(parseMsg('/delete #45').draftId, '45');
  assert.equal(parseMsg('حذف #77').command, 'reject');
  assert.equal(parseMsg('حذف #77').draftId, '77');
});

test('workflow 2 Handle Rejection Node validates draftId and verifies deletion', () => {
  const rejectCode = nodes.get('Handle Rejection Node')?.parameters?.jsCode || '';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf2-reject-'));
  const draftsFile = path.join(tmpDir, 'pending_drafts.json');
  fs.writeFileSync(draftsFile, JSON.stringify([{ id: 10, text: 'hello' }, { id: 20, text: 'world' }]));

  const runReject = (draftId) => {
    const fakeFs = {
      ...fs,
      existsSync: (p) => (p === '/data/pending_drafts.json' ? fs.existsSync(draftsFile) : false),
      readFileSync: (p, enc) => (p === '/data/pending_drafts.json' ? fs.readFileSync(draftsFile, enc) : ''),
      writeFileSync: (p, data, enc) => (p === '/data/pending_drafts.json' ? fs.writeFileSync(draftsFile, data, enc) : undefined),
    };
    const execute = new Function('$', 'require', rejectCode);
    return execute(
      () => ({ first: () => ({ json: { chatId: 445566, draftId } }) }),
      (mod) => (mod === 'fs' ? fakeFs : null),
    )[0].json;
  };

  try {
    const missingId = runReject(null);
    assert.match(missingId.replyText, /يرجى تحديد رقم المسودة/);
    assert.equal(JSON.parse(fs.readFileSync(draftsFile, 'utf8')).length, 2);

    const notFound = runReject('999');
    assert.match(notFound.replyText, /لم أجد المسودة #999/);
    assert.equal(JSON.parse(fs.readFileSync(draftsFile, 'utf8')).length, 2);

    const deleted = runReject('10');
    assert.match(deleted.replyText, /تم حذف المسودة #10/);
    const remaining = JSON.parse(fs.readFileSync(draftsFile, 'utf8'));
    assert.deepEqual(remaining.map((d) => d.id), [20]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('workflow 2 validates secret token header against TELEGRAM_WEBHOOK_SECRET when set', () => {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  assert.ok(parserCode);
  const execute = new Function('$input', '$env', 'require', parserCode);

  const makePayload = (headers = {}, userId = 445566) => ({
    item: {
      json: {
        headers,
        body: {
          message: {
            from: { id: userId },
            chat: { id: userId },
            text: '/help',
          },
        },
        allowedTelegramUserId: String(userId),
      },
    },
  });

  const envWithSecret = { TELEGRAM_WEBHOOK_SECRET: 'my-super-secret-123' };

  // Matching secret token header
  const authorizedResult = execute(
    makePayload({ 'x-telegram-bot-api-secret-token': 'my-super-secret-123' }),
    envWithSecret,
    (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)),
  )[0].json;
  assert.equal(authorizedResult.authorized, true);

  // Mismatched secret token header
  const invalidResult = execute(
    makePayload({ 'x-telegram-bot-api-secret-token': 'wrong-secret' }),
    envWithSecret,
    (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)),
  )[0].json;
  assert.equal(invalidResult.authorized, false);

  // Missing secret token header when secret is configured
  const missingResult = execute(
    makePayload({}),
    envWithSecret,
    (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)),
  )[0].json;
  assert.equal(missingResult.authorized, false);
});

test('workflow 2 parser prioritizes long situations containing project keywords over short commands', () => {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  const execute = new Function('$input', 'require', parserCode);
  const parseMsg = (text) => execute({
    item: {
      json: {
        body: {
          message: {
            from: { id: 445566 },
            chat: { id: 445566 },
            text,
          },
        },
        allowedTelegramUserId: '445566',
      },
    },
  }, (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)))[0].json;

  // A long technical text mentioning "مشاريع" and "معاينة"
  const situationText = 'واجهنا مشكلة غير متوقعة في مشاريع سابقة متعلقة بـ PostGIS وبطء استعلامات الفهرس الجغرافي عند ضغط الطلبات';
  const parsed = parseMsg(situationText);
  assert.equal(parsed.command, 'generate');
  assert.equal(parsed.situation, situationText);

  // Short commands still trigger show
  assert.equal(parseMsg('مشاريع').command, 'show');
  assert.equal(parseMsg('معاينة 5').command, 'show');
  assert.equal(parseMsg('معاينة 5').draftId, '5');
});

test('workflow 2 parses /edit command and Handle Edit Node updates draft text atomically', () => {
  const parserCode = nodes.get('Security & Command Parser')?.parameters?.jsCode;
  const executeParser = new Function('$input', 'require', parserCode);
  const parsed = executeParser({
    item: {
      json: {
        body: {
          message: {
            from: { id: 445566 },
            chat: { id: 445566 },
            text: '/edit 105 هذا النص المحدث بعد المراجعة اليدوية للمنشور الهندسي.',
          },
        },
        allowedTelegramUserId: '445566',
      },
    },
  }, (mod) => (mod === 'fs' ? fs : (mod === 'path' ? path : null)))[0].json;

  assert.equal(parsed.command, 'edit');
  assert.equal(parsed.draftId, '105');
  assert.equal(parsed.situation, 'هذا النص المحدث بعد المراجعة اليدوية للمنشور الهندسي.');

  // Test Handle Edit Node
  const editCode = nodes.get('Handle Edit Node')?.parameters?.jsCode || '';
  assert.ok(editCode, 'Handle Edit Node code should be present');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf2-edit-'));
  const draftsFile = path.join(tmpDir, 'pending_drafts.json');
  fs.writeFileSync(draftsFile, JSON.stringify([
    { id: 105, text: 'نص قديم يحتاج تعديل' },
    { id: 106, text: 'منشور آخر' },
  ]));

  const fakeFs = {
    ...fs,
    existsSync: (p) => (p === '/data/pending_drafts.json' ? fs.existsSync(draftsFile) : false),
    readFileSync: (p, enc) => (p === '/data/pending_drafts.json' ? fs.readFileSync(draftsFile, enc) : ''),
    writeFileSync: (p, data, enc) => (p === '/data/pending_drafts.json' ? fs.writeFileSync(draftsFile, data, enc) : undefined),
  };

  try {
    const executeEdit = new Function('$', 'require', editCode);
    const result = executeEdit(
      () => ({ first: () => ({ json: { chatId: 445566, draftId: '105', situation: 'النص الجديد المحكم' } }) }),
      (mod) => (mod === 'fs' ? fakeFs : null),
    )[0].json;

    assert.match(result.replyText, /تم تحديث نص المسودة #105 بنجاح/);
    const updatedDrafts = JSON.parse(fs.readFileSync(draftsFile, 'utf8'));
    assert.equal(updatedDrafts.find((d) => d.id === 105)?.text, 'النص الجديد المحكم');
    assert.equal(updatedDrafts.find((d) => d.id === 106)?.text, 'منشور آخر');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
