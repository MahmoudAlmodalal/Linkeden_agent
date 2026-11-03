import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('show callback returns image binary and sends it through Telegram multipart upload', () => {
  const showCode = nodes.get('Handle Show Node')?.parameters?.jsCode || '';
  assert.doesNotMatch(showCode, /child_process|execSync/);
  assert.match(showCode, /replyText/);
  const showLinks = workflow.connections['Handle Show Node']?.main?.[0] || [];
  assert.deepEqual(showLinks.map((link) => link.node), [
    'Telegram Preview Photo Node', 'Telegram Preview Reply Node',
  ]);
  assert.equal(nodes.get('Telegram Preview Reply Node')?.type, 'n8n-nodes-base.httpRequest');
  assert.doesNotMatch(
    JSON.stringify(nodes.get('Telegram Preview Reply Node')?.parameters?.bodyParameters?.parameters || []),
    /parse_mode/,
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
