import { pathToFileURL } from 'node:url';

/**
 * Resolve the public n8n Telegram webhook endpoint.
 * TELEGRAM_WEBHOOK_URL can override automatic Render/local URL detection.
 */
export function resolveTelegramWebhookUrl(env = process.env) {
  const explicitUrl = env.TELEGRAM_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');

  const baseUrl = env.WEBHOOK_URL?.trim()
    || (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : '');
  if (!baseUrl) return null;

  return `${baseUrl.replace(/\/+$/, '')}/webhook/telegram-webhook`;
}

/** Register message and inline-button callback updates with Telegram. */
export async function registerTelegramWebhook({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const url = resolveTelegramWebhookUrl(env);

  if (!token || !url) {
    logger.warn?.('Telegram webhook registration skipped: bot token or public webhook URL is not configured.');
    return { skipped: true };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram setWebhook failed (${response.status}): ${result.description || 'unknown error'}`);
  }

  logger.info?.('Telegram webhook registered with message and callback_query updates.');
  return { ok: true, url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerTelegramWebhook().catch((error) => {
    console.error(`Telegram webhook registration failed: ${error.message}`);
    process.exitCode = 1;
  });
}
