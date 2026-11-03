import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerTelegramWebhook,
  resolveTelegramWebhookUrl,
} from '../scripts/register_telegram_webhook.mjs';

test('resolves webhook endpoint from Render hostname', () => {
  assert.equal(
    resolveTelegramWebhookUrl({ RENDER_EXTERNAL_HOSTNAME: 'linkeden-agent.onrender.com' }),
    'https://linkeden-agent.onrender.com/webhook/telegram-webhook',
  );
});

test('resolves webhook endpoint from WEBHOOK_URL without duplicating trailing slashes', () => {
  assert.equal(
    resolveTelegramWebhookUrl({ WEBHOOK_URL: 'https://tunnel.example.test///' }),
    'https://tunnel.example.test/webhook/telegram-webhook',
  );
});

test('explicit Telegram webhook URL takes precedence', () => {
  assert.equal(
    resolveTelegramWebhookUrl({
      TELEGRAM_WEBHOOK_URL: 'https://custom.example.test/webhook/telegram-webhook/',
      RENDER_EXTERNAL_HOSTNAME: 'linkeden-agent.onrender.com',
    }),
    'https://custom.example.test/webhook/telegram-webhook',
  );
});

test('registers callback_query in Telegram allowed_updates', async () => {
  let request;
  const result = await registerTelegramWebhook({
    env: {
      TELEGRAM_BOT_TOKEN: 'test-token',
      RENDER_EXTERNAL_HOSTNAME: 'linkeden-agent.onrender.com',
    },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
    },
    logger: { info() {}, warn() {} },
  });

  assert.equal(request.url, 'https://api.telegram.org/bottest-token/setWebhook');
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(JSON.parse(request.init.body), {
    url: 'https://linkeden-agent.onrender.com/webhook/telegram-webhook',
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: false,
  });
  assert.equal(result.ok, true);
});

test('does not call Telegram if token or webhook URL is unavailable', async () => {
  let called = false;
  const result = await registerTelegramWebhook({
    env: { TELEGRAM_BOT_TOKEN: 'test-token' },
    fetchImpl: async () => { called = true; },
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(result, { skipped: true });
  assert.equal(called, false);
});
