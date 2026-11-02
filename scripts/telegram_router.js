import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Verifies if an incoming message/update is from the authorized Telegram reviewer.
 *
 * @param {object} message - Telegram message object or update
 * @param {string|number} [allowedUserId] - Optional allowed ID override
 * @returns {boolean}
 */
export function isAuthorized(message, allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID) {
  if (!message || !allowedUserId) {
    return false;
  }

  const senderId = message.from?.id ?? message.message?.from?.id;
  if (senderId === undefined || senderId === null) {
    return false;
  }

  return String(senderId) === String(allowedUserId);
}

/**
 * Parses Telegram command text and extracts command type and draft ID.
 *
 * @param {string} text - Message text
 * @returns {{ command: string, draftId: number|null, raw: string } | null}
 */
export function parseCommand(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Matches /command@botname or /command followed by optional arguments
  const match = trimmed.match(/^\/([a-zA-Z0-9_]+)(?:@[\w-]+)?(?:\s+(.*))?$/);
  if (!match) {
    return null;
  }

  const rawCmd = match[1].toLowerCase();
  const rawArg = match[2]?.trim();

  let draftId = null;
  if (rawArg) {
    // Strip leading '#' if provided e.g. #42
    const cleanId = rawArg.replace(/^#/, '').trim();
    const parsedNum = parseInt(cleanId, 10);
    if (!Number.isNaN(parsedNum)) {
      draftId = parsedNum;
    }
  }

  switch (rawCmd) {
    case 'approve':
      return {
        command: 'approve',
        draftId,
        raw: trimmed,
      };
    case 'reject':
      return {
        command: 'reject',
        draftId,
        raw: trimmed,
      };
    case 'generate':
      return {
        command: 'generate',
        draftId: null,
        raw: trimmed,
      };
    default:
      return {
        command: 'unknown',
        draftId: null,
        raw: trimmed,
      };
  }
}

/**
 * Formats a preview caption for Telegram photo dispatch.
 *
 * @param {object} draft - Draft object containing id and post text
 * @returns {string}
 */
export function formatPreviewCaption(draft) {
  const draftId = draft?.id ?? 'N/A';
  const postText = draft?.text || draft?.post_text || draft?.content || '';

  return (
    `[Draft ID: #${draftId}]\n\n` +
    `${postText}\n\n` +
    `─── Action Instructions ───\n` +
    `• Approve: /approve ${draftId}\n` +
    `• Reject: /reject ${draftId}`
  );
}

/**
 * Loads pending drafts from a JSON file.
 *
 * @param {string} [filePath='data/pending_drafts.json']
 * @returns {Array}
 */
export function loadPendingDrafts(filePath = 'data/pending_drafts.json') {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.drafts)) {
      return parsed.drafts;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Persists pending drafts to a JSON file.
 *
 * @param {Array} drafts
 * @param {string} [filePath='data/pending_drafts.json']
 */
export function savePendingDrafts(drafts, filePath = 'data/pending_drafts.json') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(drafts, null, 2), 'utf-8');
}

/**
 * Adds a new draft to the pending queue.
 *
 * @param {object} draft
 * @param {string} [filePath='data/pending_drafts.json']
 * @returns {object}
 */
export function addPendingDraft(draft, filePath = 'data/pending_drafts.json') {
  const drafts = loadPendingDrafts(filePath);
  drafts.push(draft);
  savePendingDrafts(drafts, filePath);
  return draft;
}

/**
 * Retrieves the latest pending draft from the queue.
 *
 * @param {string} [filePath='data/pending_drafts.json']
 * @returns {object|null}
 */
export function getLatestPendingDraft(filePath = 'data/pending_drafts.json') {
  const drafts = loadPendingDrafts(filePath);
  if (drafts.length === 0) {
    return null;
  }
  return drafts[drafts.length - 1];
}

/**
 * Retrieves a draft by ID.
 *
 * @param {number|string} draftId
 * @param {string} [filePath='data/pending_drafts.json']
 * @returns {object|null}
 */
export function getPendingDraftById(draftId, filePath = 'data/pending_drafts.json') {
  const drafts = loadPendingDrafts(filePath);
  return drafts.find((d) => Number(d.id) === Number(draftId)) || null;
}

/**
 * Removes a draft by ID from pending_drafts.json.
 *
 * @param {number|string} draftId
 * @param {string} [filePath='data/pending_drafts.json']
 * @returns {object|null} The removed draft or null if not found
 */
export function removePendingDraft(draftId, filePath = 'data/pending_drafts.json') {
  const drafts = loadPendingDrafts(filePath);
  const index = drafts.findIndex((d) => Number(d.id) === Number(draftId));
  if (index === -1) {
    return null;
  }

  const [removed] = drafts.splice(index, 1);
  savePendingDrafts(drafts, filePath);
  return removed;
}

/**
 * Handles incoming Telegram webhook updates, enforces security, and routes commands.
 *
 * @param {object} update - Incoming Telegram update object
 * @param {object} [options={}] - Options and dependencies
 * @returns {Promise<object>}
 */
export async function handleTelegramUpdate(update, options = {}) {
  const allowedUserId = options.allowedUserId ?? process.env.TELEGRAM_ALLOWED_USER_ID;
  const pendingDraftsPath = options.pendingDraftsPath ?? 'data/pending_drafts.json';

  const message = update?.message || update?.edited_message || update;

  // 1. Enforce strict authorization
  if (!isAuthorized(message, allowedUserId)) {
    return {
      authorized: false,
      status: 'blocked',
      message: 'Unauthorized user: update rejected immediately.',
    };
  }

  const text = message?.text || '';
  const parsed = parseCommand(text);

  if (!parsed) {
    return {
      authorized: true,
      success: false,
      command: null,
      replyText: 'Please send a valid command: /approve [id], /reject <id>, or /generate.',
    };
  }

  switch (parsed.command) {
    case 'approve': {
      let draft = null;
      if (parsed.draftId !== null) {
        draft = getPendingDraftById(parsed.draftId, pendingDraftsPath);
      } else {
        draft = getLatestPendingDraft(pendingDraftsPath);
      }

      if (!draft) {
        return {
          authorized: true,
          success: false,
          command: 'approve',
          replyText: 'No pending draft found to approve.',
        };
      }

      return {
        authorized: true,
        success: true,
        command: 'approve',
        draft,
        replyText: `Draft #${draft.id} approved. Proceeding to LinkedIn publication.`,
      };
    }

    case 'reject': {
      if (parsed.draftId === null) {
        return {
          authorized: true,
          success: false,
          command: 'reject',
          replyText: 'Draft ID is required to reject. Usage: /reject <id>',
        };
      }

      const removed = removePendingDraft(parsed.draftId, pendingDraftsPath);
      if (!removed) {
        return {
          authorized: true,
          success: false,
          command: 'reject',
          draftId: parsed.draftId,
          replyText: `Draft #${parsed.draftId} not found in pending drafts.`,
        };
      }

      return {
        authorized: true,
        success: true,
        command: 'reject',
        draftId: parsed.draftId,
        replyText: `Draft #${parsed.draftId} has been rejected and removed from pending queue.`,
      };
    }

    case 'generate': {
      if (typeof options.triggerWorkflow1 === 'function') {
        await options.triggerWorkflow1({
          source: 'telegram_command',
          triggeredBy: message?.from?.id,
          timestamp: new Date().toISOString(),
        });
      } else if (options.workflow1WebhookUrl) {
        await fetch(options.workflow1WebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'telegram_command',
            triggeredBy: message?.from?.id,
          }),
        });
      }

      return {
        authorized: true,
        success: true,
        command: 'generate',
        replyText: 'Draft generation triggered for Workflow 1 staging run.',
      };
    }

    case 'unknown':
    default: {
      return {
        authorized: true,
        success: false,
        command: 'unknown',
        replyText:
          'Unknown command. Available commands:\n' +
          '• /approve [id] - Approve draft for LinkedIn publication (defaults to latest)\n' +
          '• /reject <id> - Discard draft from pending queue\n' +
          '• /generate - Trigger immediate technical draft generation',
      };
    }
  }
}

/**
 * Sends a photo message with formatted caption to Telegram.
 *
 * @param {object} draft - Draft object
 * @param {object} [options={}] - Options (chatId, botToken, client)
 * @returns {Promise<object>}
 */
export async function sendPreviewMessage(draft, options = {}) {
  const chatId = options.chatId || process.env.TELEGRAM_ALLOWED_USER_ID;
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const photo = draft?.image_path || draft?.image || draft?.photo;
  const caption = formatPreviewCaption(draft);

  const payload = {
    chat_id: String(chatId),
    photo,
    caption,
  };

  if (options.client && typeof options.client.sendPhoto === 'function') {
    return options.client.sendPhoto(payload);
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.json();
}

// Allow CLI execution if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Telegram Command Ingress Router');
    console.log('Usage: node scripts/telegram_router.js <update.json>');
    process.exit(0);
  }
}
