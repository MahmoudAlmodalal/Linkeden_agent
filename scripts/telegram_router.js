import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env if present
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...values] = trimmed.split('=');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
    break;
  }
}

export const TELEGRAM_REMOVE_KEYBOARD = {
  remove_keyboard: true,
};
export const TELEGRAM_REPLY_KEYBOARD = TELEGRAM_REMOVE_KEYBOARD;

/**
 * Loads scenarios archive from a JSON file.
 *
 * @param {string} [filePath='data/scenarios.json']
 * @returns {Array}
 */
export function loadScenarios(filePath = 'data/scenarios.json') {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return [];
    const raw = fs.readFileSync(resolved, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.scenarios || []);
  } catch {
    return [];
  }
}

/**
 * Saves scenarios archive to a JSON file.
 *
 * @param {Array} scenarios
 * @param {string} [filePath='data/scenarios.json']
 */
export function saveScenarios(scenarios, filePath = 'data/scenarios.json') {
  const resolved = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(scenarios, null, 2), 'utf8');
}

/**
 * Appends a scenario to the archive.
 *
 * @param {object} scenario
 * @param {string} [filePath='data/scenarios.json']
 * @returns {object}
 */
export function addScenario(scenario, filePath = 'data/scenarios.json') {
  const list = loadScenarios(filePath);
  const item = {
    id: list.length + 1,
    ...scenario,
    created_at: scenario.created_at || new Date().toISOString(),
  };
  list.push(item);
  saveScenarios(list, filePath);
  return item;
}

/**
 * Loads reviewer state from data/bot_state.json.
 *
 * @param {string} [filePath='data/bot_state.json']
 * @returns {object}
 */
export function loadBotState(filePath = 'data/bot_state.json') {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return {};
    const raw = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/**
 * Saves reviewer state to data/bot_state.json.
 *
 * @param {object} state
 * @param {string} [filePath='data/bot_state.json']
 */
export function saveBotState(state, filePath = 'data/bot_state.json') {
  const resolved = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Gets state for a specific user ID.
 *
 * @param {string|number} userId
 * @param {string} [filePath='data/bot_state.json']
 * @returns {object|null}
 */
export function getUserState(userId, filePath = 'data/bot_state.json') {
  if (!userId) return null;
  const state = loadBotState(filePath);
  return state[String(userId)] || null;
}

/**
 * Sets state for a specific user ID.
 *
 * @param {string|number} userId
 * @param {object} stateData
 * @param {string} [filePath='data/bot_state.json']
 */
export function setUserState(userId, stateData, filePath = 'data/bot_state.json') {
  if (!userId) return;
  const state = loadBotState(filePath);
  state[String(userId)] = {
    ...stateData,
    updated_at: new Date().toISOString(),
  };
  saveBotState(state, filePath);
}

/**
 * Clears state for a specific user ID.
 *
 * @param {string|number} userId
 * @param {string} [filePath='data/bot_state.json']
 */
export function clearUserState(userId, filePath = 'data/bot_state.json') {
  if (!userId) return;
  const state = loadBotState(filePath);
  if (state[String(userId)]) {
    delete state[String(userId)];
    saveBotState(state, filePath);
  }
}


/**
 * Resolves local image paths whether running locally or inside Docker.
 *
 * @param {string} photo
 * @returns {string|null}
 */
export function resolveImagePath(photo, project = null) {
  const candidates = [];
  if (photo && typeof photo === 'string') {
    candidates.push(
      photo,
      path.resolve(process.cwd(), photo),
      photo.startsWith('/') ? photo.slice(1) : '/' + photo,
      path.join('/assets', path.basename(photo)),
      path.join('/data/generated_images', path.basename(photo)),
      path.resolve(process.cwd(), 'assets', path.basename(photo)),
      path.resolve(process.cwd(), 'data/generated_images', path.basename(photo))
    );
  }

  if (project && typeof project === 'string') {
    const slug = project.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    candidates.push(
      path.join('/assets', `${slug}.webp`),
      path.join('/assets', `${slug}.png`),
      path.resolve(process.cwd(), 'assets', `${slug}.webp`),
      path.resolve(process.cwd(), 'assets', `${slug}.png`)
    );
  }

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile() && fs.statSync(cand).size > 100) {
        return cand;
      }
    } catch {}
  }
  return null;
}

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

  const senderId =
    message.from?.id ??
    message.message?.from?.id ??
    message.callback_query?.from?.id;
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

  // 1. Standard slash commands: /command [arg]
  if (trimmed.startsWith('/')) {
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
      case 'generate': {
        const cmdObj = {
          command: 'generate',
          draftId: null,
          raw: trimmed,
        };
        if (rawArg) {
          cmdObj.query = rawArg;
        }
        return cmdObj;
      }
      case 'show':
      case 'preview':
      case 'post':
      case 'posts':
      case 'project':
      case 'projects':
        return {
          command: 'show',
          draftId: draftId || (rawArg ? rawArg.trim() : null),
          raw: trimmed,
        };
      case 'drafts':
      case 'draft':
      case 'grafs':
      case 'graf':
      case 'list':
        return {
          command: 'drafts',
          draftId: null,
          raw: trimmed,
        };
      case 'help':
      case 'start':
      case 'menu':
        return {
          command: 'help',
          draftId: null,
          raw: trimmed,
        };
      case 'situation':
      case 'incident':
      case 'scenario':
        return {
          command: 'situation',
          prompt: rawArg || null,
          draftId: null,
          raw: trimmed,
        };
      case 'cancel':
        return {
          command: 'cancel',
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

  // 2. Telegram callback data: underscore format is canonical; colon format remains compatible.
  const draftCallback = trimmed.match(/^(approve|reject|show|preview)[_:](\d+)$/iu);
  if (draftCallback) {
    const cmd = draftCallback[1].toLowerCase();
    return {
      command: cmd === 'preview' ? 'show' : cmd,
      draftId: Number(draftCallback[2]),
      raw: trimmed,
    };
  }
  if (trimmed === 'generate_new' || trimmed === 'generate') {
    return { command: 'generate', draftId: null, raw: trimmed };
  }
  if (trimmed === 'approve') {
    return { command: 'approve', draftId: null, raw: trimmed };
  }
  if (trimmed === 'drafts' || trimmed === 'draft' || trimmed === 'grafs' || trimmed === 'graf' || trimmed === 'list') {
    return { command: 'drafts', draftId: null, raw: trimmed };
  }
  if (trimmed === 'show' || trimmed === 'preview' || trimmed === 'post' || trimmed === 'posts') {
    return { command: 'show', draftId: null, raw: trimmed };
  }
  if (trimmed === 'help' || trimmed === 'start' || trimmed === 'menu') {
    return { command: 'help', draftId: null, raw: trimmed };
  }
  if (trimmed === 'situation') {
    return { command: 'situation', prompt: null, draftId: null, raw: trimmed };
  }
  if (trimmed === 'cancel') {
    return { command: 'cancel', draftId: null, raw: trimmed };
  }

  // 3. Interactive Reply Keyboard touch button labels (Arabic & English)
  if (
    trimmed.includes('/situation') ||
    trimmed.includes('/incident') ||
    trimmed.startsWith('💡 موقف') ||
    trimmed.startsWith('⚡ موقف') ||
    trimmed.startsWith('موقف:')
  ) {
    const rawPrompt = trimmed
      .replace(/^\/(?:situation|incident)(?:@[\w-]+)?\s*/i, '')
      .replace(/^[💡⚡]\s*موقف\s*:?\s*/u, '')
      .replace(/^موقف\s*:?\s*/u, '')
      .trim();
    return {
      command: 'situation',
      prompt: rawPrompt || null,
      draftId: null,
      raw: trimmed,
    };
  }
  if (trimmed.includes('/cancel') || trimmed.startsWith('❌ إلغاء') || trimmed === 'إلغاء') {
    return { command: 'cancel', draftId: null, raw: trimmed };
  }
  if (trimmed.includes('/generate') || trimmed.startsWith('⚡ توليد')) {
    return { command: 'generate', draftId: null, raw: trimmed };
  }
  if (
    trimmed.includes('/show') ||
    trimmed.includes('/preview') ||
    trimmed.includes('/post') ||
    trimmed.includes('/project') ||
    trimmed.includes('عرض مسودة') ||
    trimmed.includes('عرض المنشور') ||
    trimmed.includes('عرض المناشير') ||
    trimmed.includes('عرض مشروع') ||
    trimmed.includes('عرض المشروع') ||
    trimmed.includes('عرض مشاريع') ||
    trimmed.includes('عرض المشاريع') ||
    trimmed.includes('المشاريع') ||
    trimmed.includes('مشاريع') ||
    trimmed.startsWith('مشروع') ||
    trimmed.includes('معاينة') ||
    trimmed.startsWith('👁️')
  ) {
    const numMatch = trimmed.match(/#?(\d+)/);
    let draftId = numMatch ? parseInt(numMatch[1], 10) : null;
    if (!draftId) {
      const cleaned = trimmed
        .replace(/^(?:\/show|\/preview|\/post|\/project|\/projects|👁️|عرض مسودة|عرض المنشور|عرض المناشير|عرض مشروع|عرض المشروع|عرض مشاريع|عرض المشاريع|المشاريع|مشاريع|مشروع|معاينة)\s*/iu, '')
        .trim();
      if (cleaned && !cleaned.startsWith('#')) {
        draftId = cleaned;
      }
    }
    return { command: 'show', draftId, raw: trimmed };
  }
  if (
    trimmed.includes('/drafts') ||
    trimmed.includes('/draft') ||
    trimmed.includes('/grafs') ||
    trimmed.includes('/graf') ||
    trimmed.includes('/list') ||
    trimmed.includes('المسودات') ||
    trimmed.includes('المنشورات') ||
    trimmed.startsWith('📋')
  ) {
    return { command: 'drafts', draftId: null, raw: trimmed };
  }
  if (trimmed.includes('/approve') || trimmed.startsWith('✅ نشر')) {
    const numMatch = trimmed.match(/#?(\d+)/);
    const draftId = numMatch ? parseInt(numMatch[1], 10) : null;
    return { command: 'approve', draftId, raw: trimmed };
  }
  if (trimmed.includes('/reject') || trimmed.startsWith('🗑️ رفض') || trimmed.startsWith('❌ رفض')) {
    const numMatch = trimmed.match(/#?(\d+)/);
    const draftId = numMatch ? parseInt(numMatch[1], 10) : null;
    return { command: 'reject', draftId, raw: trimmed };
  }
  if (trimmed.includes('/help') || trimmed.startsWith('ℹ️ المساعدة')) {
    return { command: 'help', draftId: null, raw: trimmed };
  }

  return null;
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
 * Dispatches draft generation for a custom situation prompt.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function dispatchSituationDraft({ situation, senderFromId, options = {}, scenariosPath = 'data/scenarios.json' }) {
  if (typeof options.triggerWorkflow1 === 'function') {
    await options.triggerWorkflow1({
      source: 'telegram_situation',
      triggeredBy: senderFromId,
      situation,
      timestamp: new Date().toISOString(),
    });
  } else if (options.workflow1WebhookUrl) {
    await fetch(options.workflow1WebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'telegram_situation',
        triggeredBy: senderFromId,
        situation,
      }),
    });
  }

  // Record in scenarios archive
  const scenarioItem = addScenario({
    situation,
    submitted_by: senderFromId,
    created_at: new Date().toISOString(),
  }, scenariosPath);

  return {
    authorized: true,
    success: true,
    command: 'situation',
    situation,
    scenarioId: scenarioItem.id,
    replyText:
      '🚀 *تم استلام تفاصيل الموقف بنجاح!*\n\n' +
      'جارٍ حقن الموقف في الـ System Prompt وتوليد المنشور والبطاقة المرئية...\n' +
      'ستصلك رسالة المعاينة والاعتماد فور جهوزيتها.',
    replyMarkup: TELEGRAM_REPLY_KEYBOARD,
  };
}

/**
 * Acknowledges a Telegram inline-keyboard callback so Telegram stops its loading spinner.
 *
 * @param {string} callbackQueryId
 * @param {object} [options={}] - Supports botToken and fetch injection for tests.
 * @returns {Promise<object>}
 */
export async function answerTelegramCallbackQuery(callbackQueryId, options = {}) {
  const botToken = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!callbackQueryId || !botToken) return { skipped: true };

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available to answer Telegram callback queries.');
  }

  const response = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: String(callbackQueryId) }),
    },
  );

  if (!response.ok) {
    const details = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`Telegram answerCallbackQuery failed (${response.status}): ${details}`);
  }
  return typeof response.json === 'function' ? response.json() : { ok: true };
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
  const botStatePath = options.botStatePath ?? 'data/bot_state.json';
  const scenariosPath = options.scenariosPath ?? 'data/scenarios.json';

  const callbackQuery = update?.callback_query;
  const message = callbackQuery ? callbackQuery : (update?.message || update?.edited_message || update);

  // Acknowledge callback taps before authorization and any slower draft/publish work.
  if (callbackQuery?.id) {
    try {
      const acknowledge = options.answerCallbackQuery ?? answerTelegramCallbackQuery;
      await acknowledge(callbackQuery.id, options);
    } catch (error) {
      options.logger?.warn?.('Could not answer Telegram callback query:', error.message);
    }
  }

  // 1. Enforce strict authorization
  if (!isAuthorized(message, allowedUserId)) {
    return {
      authorized: false,
      status: 'blocked',
      message: 'Unauthorized user: update rejected immediately.',
    };
  }

  const senderId =
    message?.from?.id ??
    message?.message?.from?.id ??
    callbackQuery?.from?.id;

  const rawText = callbackQuery?.data || message?.text || '';
  const parsed = parseCommand(rawText);

  // Check stateful conversation
  const userState = getUserState(senderId, botStatePath);
  if (userState && userState.state === 'awaiting_situation') {
    if (parsed && parsed.command === 'cancel') {
      clearUserState(senderId, botStatePath);
      return {
        authorized: true,
        success: true,
        command: 'cancel',
        replyText: 'تم إلغاء كتابة الموقف.',
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    } else {
      const promptToUse = (parsed?.command === 'situation' && parsed.prompt) ? parsed.prompt : rawText.trim();
      if (promptToUse) {
        clearUserState(senderId, botStatePath);
        return await dispatchSituationDraft({
          situation: promptToUse,
          senderFromId: senderId,
          options,
          scenariosPath,
        });
      }
    }
  }

  if (!parsed) {
    const trimmed = rawText.trim();
    if (trimmed.length >= 40 || trimmed.includes('\n')) {
      // Auto-detect direct situation input
      return await dispatchSituationDraft({
        situation: trimmed,
        senderFromId: senderId,
        options,
        scenariosPath,
      });
    }

    return {
      authorized: true,
      success: false,
      command: null,
      replyText: 'Please send a valid command: /approve [id], /reject <id>, /generate, /situation, /drafts, or /help.',
      replyMarkup: TELEGRAM_REPLY_KEYBOARD,
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
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }

      return {
        authorized: true,
        success: true,
        command: 'approve',
        draft,
        replyText: `Draft #${draft.id} approved. Proceeding to LinkedIn publication.`,
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }

    case 'reject': {
      if (parsed.draftId === null) {
        return {
          authorized: true,
          success: false,
          command: 'reject',
          replyText: 'Draft ID is required to reject. Usage: /reject <id>',
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
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
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }

      return {
        authorized: true,
        success: true,
        command: 'reject',
        draftId: parsed.draftId,
        replyText: `Draft #${parsed.draftId} has been rejected and removed from pending queue.`,
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }

    case 'generate': {
      const senderFromId = message?.from?.id;
      const query = parsed.query || null;
      const payload = {
        source: 'telegram_command',
        triggeredBy: senderFromId,
        query,
        timestamp: new Date().toISOString(),
      };
      const fetchImpl = options.fetch ?? globalThis.fetch;

      try {
        if (typeof options.triggerWorkflow1 === 'function') {
          await options.triggerWorkflow1(payload);
        } else if (options.workflow1WebhookUrl) {
          if (typeof fetchImpl !== 'function') {
            throw new Error('No fetch implementation is available to trigger Workflow 1.');
          }
          const response = await fetchImpl(options.workflow1WebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: payload.source,
              triggeredBy: payload.triggeredBy,
              query: payload.query,
            }),
          });
          if (!response.ok) {
            const details = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
            throw new Error(`Workflow 1 webhook returned HTTP ${response.status}${details ? `: ${details}` : ''}`);
          }
        } else {
          return {
            authorized: true,
            success: false,
            command: 'generate',
            query,
            replyText:
              'تعذر تشغيل Workflow 1: لا توجد آلية تشغيل مهيأة حالياً.\n' +
              'Run the n8n staging workflow at /webhook/generate, or pass a triggerWorkflow1/workflow1WebhookUrl option.',
            replyMarkup: TELEGRAM_REPLY_KEYBOARD,
          };
        }

        const replyText = query
          ? `Draft generation triggered for Workflow 1 staging run (Topic/Project: "${query}").`
          : 'Draft generation triggered for Workflow 1 staging run.';

        return {
          authorized: true,
          success: true,
          command: 'generate',
          query,
          replyText,
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      } catch (error) {
        return {
          authorized: true,
          success: false,
          command: 'generate',
          query,
          replyText:
            `تعذر تشغيل Workflow 1 لتوليد المنشور.\n` +
            `السبب: ${error?.message || String(error)}\n\n` +
            `تأكد أن الـ staging workflow يعمل ثم حاول مرة أخرى.`,
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }
    }

    case 'drafts': {
      const drafts = loadPendingDrafts(pendingDraftsPath);
      if (drafts.length === 0) {
        return {
          authorized: true,
          success: true,
          command: 'drafts',
          drafts: [],
          replyText:
            '📋 *قائمة المسودات المعلقة*\n\n' +
            'لا توجد حالياً أي مسودات معلقة في قائمة المراجعة.\n\n' +
            '💡 يمكنك توليد مسودة جديدة الآن بالضغط على الزر أدناه:',
          inlineKeyboard: [
            [{ text: '⚡ توليد مسودة الآن', callback_data: 'generate_new' }],
          ],
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }

      let draftListText = `📋 *المسودات المعلقة في الانتظار (${drafts.length})*\n\n`;
      const inlineButtons = [];

      for (const draft of drafts) {
        const draftId = draft.id;
        const topic = draft.topic || 'مسودة تقنية';
        const preview = (draft.text || draft.post_text || '').slice(0, 80).replace(/\n/g, ' ');
        draftListText += `• *مسودة #${draftId}* (${topic}):\n  _${preview}..._\n\n`;
        inlineButtons.push([
          { text: `👁️ معاينة #${draftId}`, callback_data: `show_${draftId}` },
          { text: `✅ نشر #${draftId}`, callback_data: `approve_${draftId}` },
          { text: `🗑️ حذف #${draftId}`, callback_data: `reject_${draftId}` },
        ]);
      }

      draftListText += '👇 اختر أي مسودة لمعاينتها أو اتخاذ إجراء بشأنها:';
      inlineButtons.push([
        { text: '⚡ توليد مسودة جديدة', callback_data: 'generate_new' },
      ]);

      return {
        authorized: true,
        success: true,
        command: 'drafts',
        drafts,
        replyText: draftListText,
        inlineKeyboard: inlineButtons,
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }

    case 'show': {
      const allDrafts = loadPendingDrafts(pendingDraftsPath);
      let draft = null;
      if (parsed.draftId !== null && parsed.draftId !== undefined && parsed.draftId !== '') {
        const sId = String(parsed.draftId).toLowerCase();
        draft = allDrafts.find(d => String(d.id) === sId) ||
                allDrafts.find(d => String(d.project || '').toLowerCase().includes(sId)) ||
                allDrafts.find(d => String(d.topic || '').toLowerCase().includes(sId));
      } else {
        draft = allDrafts[allDrafts.length - 1];
      }

      if (!draft) {
        if (allDrafts.length === 0) {
          return {
            authorized: true,
            success: false,
            command: 'show',
            draftId: parsed.draftId,
            replyText: '⚠️ لا توجد مسودات معلقة حالياً في النظام.\n\nاضغط /generate لتوليد منشور هندسي جديد لمشاريعك فوراً!',
            inlineKeyboard: [[{ text: '⚡ توليد مسودة الآن', callback_data: 'generate_new' }]],
            replyMarkup: TELEGRAM_REPLY_KEYBOARD,
          };
        }
        return {
          authorized: true,
          success: false,
          command: 'show',
          draftId: parsed.draftId,
          replyText: `❌ المسودة أو المشروع (${parsed.draftId || 'المحدد'}) غير موجود في قائمة الانتظار.`,
          inlineKeyboard: [[{ text: '📋 قائمة المسودات', callback_data: 'drafts' }]],
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }

      const showText = `[Draft ID: #${draft.id}]\n\n${draft.text || draft.post_text || ''}`;
      const showButtons = [
        [
          { text: `✅ اعتماد ونشر #${draft.id}`, callback_data: `approve_${draft.id}` },
          { text: `🗑️ حذف #${draft.id}`, callback_data: `reject_${draft.id}` },
        ],
        [
          { text: '📋 رجوع لقائمة المسودات', callback_data: 'drafts' },
          { text: '⚡ توليد جديد', callback_data: 'generate_new' },
        ],
      ];

      return {
        authorized: true,
        success: true,
        command: 'show',
        draft,
        replyText: showText,
        inlineKeyboard: showButtons,
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }

    case 'situation': {
      const situationPrompt = parsed.prompt?.trim();

      if (!situationPrompt) {
        setUserState(senderId, { state: 'awaiting_situation' }, botStatePath);
        return {
          authorized: true,
          success: true,
          command: 'situation',
          waitingForInput: true,
          replyText:
            '💡 *كتابة برمبت موقف هندسي*\n\n' +
            'أرسل الآن نص الموقف أو المعضلة البرمجية في رسالة، وسيقوم النظام فوراً بدمجها في الـ System Prompt وتوليد بوست معماري عالي القيمة مع بطاقة مرئية مخصصة لهويتك.\n\n' +
            '_(أو أرسل /cancel للإلغاء)_',
          replyMarkup: TELEGRAM_REPLY_KEYBOARD,
        };
      }

      clearUserState(senderId, botStatePath);
      return await dispatchSituationDraft({
        situation: situationPrompt,
        senderFromId: senderId,
        options,
        scenariosPath,
      });
    }

    case 'cancel': {
      clearUserState(senderId, botStatePath);
      return {
        authorized: true,
        success: true,
        command: 'cancel',
        replyText: 'تم إلغاء العملية بنجاح.',
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }

    case 'help': {
      const helpText =
        '🤖 *لوحة تحكم بوت النشر على LinkedIn*\n\n' +
        'أهلاً بك! يمكنك التحكم الكامل بنظام توليد ونشر المحتوى عبر الأوامر التالية:\n\n' +
        '💡 */situation [نص الموقف]* — كتابة برمبت موقف هندسي وتوليد بوست وصورة فوراً\n' +
        '⚡ */generate* — توليد مسودة تقنية جديدة مع الصورة فوراً\n' +
        '📋 */drafts* — عرض قائمة المسودات المعلقة مع أزرار النشر/الرفض والمعاينة\n' +
        '✅ */approve [id]* — اعتماد ونشر المسودة على LinkedIn (تلقائياً أحدث مسودة)\n' +
        '🗑️ */reject <id>* — حذف مسودة معينة من القائمة\n' +
        'ℹ️ */help* — عرض هذه القائمة والمساعدة\n\n' +
        '💡 _يمكنك أيضاً استخدام الأزرار التفاعلية أسفل الشاشة أو زر القائمة [/] بجانب حقل الرسالة._';

      const helpInlineButtons = [
        [
          { text: '💡 كتابة موقف (/situation)', callback_data: 'situation' },
          { text: '⚡ توليد تلقائي', callback_data: 'generate' },
        ],
        [
          { text: '📋 عرض المسودات المعلقة', callback_data: 'drafts' },
          { text: '✅ نشر أحدث مسودة', callback_data: 'approve' },
        ],
      ];

      return {
        authorized: true,
        success: true,
        command: 'help',
        replyText: helpText,
        inlineKeyboard: helpInlineButtons,
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
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
          '• /situation [prompt] - Write custom engineering scenario/incident\n' +
          '• /approve [id] - Approve draft for LinkedIn publication (defaults to latest)\n' +
          '• /reject <id> - Discard draft from pending queue\n' +
          '• /generate - Trigger immediate technical draft generation\n' +
          '• /drafts - View pending drafts queue with action buttons\n' +
          '• /help - View commands list and instructions',
        replyMarkup: TELEGRAM_REPLY_KEYBOARD,
      };
    }
  }
}

/**
 * Sends a message via Telegram Bot API using native fetch.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function sendTelegramMessage(options = {}) {
  const chatId = options.chatId || process.env.TELEGRAM_ALLOWED_USER_ID;
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const text = options.text || '';
  const parseMode = options.parseMode !== undefined ? options.parseMode : 'Markdown';
  const replyMarkup = options.replyMarkup || options.reply_markup;

  const payload = {
    chat_id: String(chatId),
    text,
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) {
    payload.reply_markup = typeof replyMarkup === 'string' ? JSON.parse(replyMarkup) : replyMarkup;
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resData = await response.json().catch(() => ({}));
    // If Markdown parsing fails, retry without parse_mode so message is never dropped
    if (!response.ok && (resData?.description?.includes('parse') || resData?.description?.includes('entity'))) {
      delete payload.parse_mode;
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return retryRes.json();
    }
    return resData;
  } catch (err) {
    console.error('sendTelegramMessage network error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends a photo message with formatted caption to Telegram.
 * Handles both local file upload via FormData/Blob and remote URL.
 * Automatically splits long captions (> 950 chars) to respect Telegram API 1024 char limit.
 *
 * @param {object} draft - Draft object
 * @param {object} [options={}] - Options (chatId, botToken, client)
 * @returns {Promise<object>}
 */
export async function sendPreviewMessage(draft, options = {}) {
  const chatId = options.chatId || process.env.TELEGRAM_ALLOWED_USER_ID;
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const rawPhoto = draft?.image_path || draft?.image || draft?.photo;
  const project = draft?.project || draft?.challenge?.project || draft?.challenge?.project_name;
  const photo = resolveImagePath(rawPhoto, project) || rawPhoto;
  const caption = options.caption || formatPreviewCaption(draft);
  const replyMarkup = options.replyMarkup || options.reply_markup;

  if (options.client && typeof options.client.sendPhoto === 'function') {
    return options.client.sendPhoto({
      chat_id: String(chatId),
      photo,
      caption,
      reply_markup: replyMarkup,
    });
  }

  // Telegram limits sendPhoto caption to 1024 characters.
  // When caption > 950 chars, send photo with concise summary + buttons,
  // then immediately send the full post text in a follow-up text message.
  const isLongCaption = typeof caption === 'string' && caption.length > 950;
  const photoCaption = isLongCaption
    ? `📋 *معاينة المسودة #${draft?.id ?? ''}*\n📌 *الموضوع:* ${draft?.topic || 'بوست تقني'}\n\n👇 _نص المنشور الكامل مرفق أدناه:_`
    : caption;

  let photoSentOk = false;
  let photoResult = null;

  // 1. Check if photo is a valid local file
  if (photo && fs.existsSync(photo) && fs.statSync(photo).size > 100) {
    try {
      const fileBytes = fs.readFileSync(photo);
      const filename = path.basename(photo);
      const endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;

      const createFormData = (useMarkdown) => {
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        formData.append('caption', photoCaption);
        if (useMarkdown) {
          formData.append('parse_mode', 'Markdown');
        }
        if (replyMarkup) {
          formData.append(
            'reply_markup',
            typeof replyMarkup === 'string' ? replyMarkup : JSON.stringify(replyMarkup)
          );
        }
        formData.append('photo', new Blob([fileBytes]), filename);
        return formData;
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        body: createFormData(true),
      });
      photoResult = await response.json().catch(() => ({}));
      if (response.ok && photoResult?.ok) {
        photoSentOk = true;
      } else if (photoResult?.description?.includes('parse') || photoResult?.description?.includes('entity')) {
        // Markdown parsing failed on unescaped entities/brackets; retry immediately without parse_mode
        const retryResp = await fetch(endpoint, {
          method: 'POST',
          body: createFormData(false),
        });
        photoResult = await retryResp.json().catch(() => ({}));
        if (retryResp.ok && photoResult?.ok) {
          photoSentOk = true;
        }
      }

      if (!photoSentOk) {
        console.warn('sendPhoto via file rejected:', photoResult?.description || photoResult);
      }
    } catch (err) {
      console.error('Binary sendPhoto error, falling back:', err.message);
    }
  }

  // 2. If photo is a remote URL and not sent yet
  if (!photoSentOk && photo && (photo.startsWith('http://') || photo.startsWith('https://'))) {
    try {
      const endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      const createPayload = (useMarkdown) => {
        const payload = {
          chat_id: String(chatId),
          photo,
          caption: photoCaption,
        };
        if (useMarkdown) payload.parse_mode = 'Markdown';
        if (replyMarkup) {
          payload.reply_markup = typeof replyMarkup === 'string' ? JSON.parse(replyMarkup) : replyMarkup;
        }
        return payload;
      };

      let response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload(true)),
      });
      photoResult = await response.json().catch(() => ({}));
      if (response.ok && photoResult?.ok) {
        photoSentOk = true;
      } else if (photoResult?.description?.includes('parse') || photoResult?.description?.includes('entity')) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload(false)),
        });
        photoResult = await response.json().catch(() => ({}));
        if (response.ok && photoResult?.ok) {
          photoSentOk = true;
        }
      }

      if (!photoSentOk) {
        console.warn('sendPhoto via URL rejected:', photoResult?.description || photoResult);
      }
    } catch (err) {
      console.error('Remote URL sendPhoto error:', err.message);
    }
  }

  // If photo was sent successfully
  if (photoSentOk) {
    if (isLongCaption) {
      await sendTelegramMessage({
        chatId,
        botToken,
        text: caption,
      });
    }
    return photoResult;
  }

  // 3. Fallback to text message if photo failed or wasn't provided
  return sendTelegramMessage({
    chatId,
    text: caption,
    replyMarkup,
    botToken,
  });
}

/**
 * Dispatches the pending drafts list directly to the specified chat.
 *
 * @param {string|number} chatId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function dispatchDraftsList(chatId = process.env.TELEGRAM_ALLOWED_USER_ID, options = {}) {
  const pendingDraftsPath = options.pendingDraftsPath || (fs.existsSync('/data/pending_drafts.json') ? '/data/pending_drafts.json' : 'data/pending_drafts.json');
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const drafts = loadPendingDrafts(pendingDraftsPath);

  if (drafts.length === 0) {
    return sendTelegramMessage({
      chatId,
      botToken,
      text: '⚠️ *لا توجد مسودات معلقة حالياً.*\n\nاضغط /generate لتوليد منشور جديد!',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '⚡ توليد مسودة الآن', callback_data: 'generate_new' }]
        ]
      }
    });
  }

  // List all available drafts (up to 20) so older drafts are accessible
  const displayDrafts = drafts.slice(-20).reverse();
  const buttons = [];
  let listText = `📋 *قائمة المسودات المتوفرة في النظام (${drafts.length}):*\n\n`;

  for (const d of displayDrafts) {
    const topic = d.topic || 'بوست تقني';
    const preview = (d.text || d.post_text || '').slice(0, 70).replace(/\n/g, ' ');
    listText += `• *مسودة #${d.id}* (${topic}):\n  _${preview}..._\n\n`;
    buttons.push([
      { text: `👁️ عرض المنشور #${d.id}`, callback_data: `show_${d.id}` },
      { text: `✅ نشر #${d.id}`, callback_data: `approve_${d.id}` },
      { text: `🗑️ حذف #${d.id}`, callback_data: `reject_${d.id}` },
    ]);
  }

  buttons.push([
    { text: '⚡ توليد مسودة جديدة', callback_data: 'generate_new' }
  ]);

  listText += '👇 اضغط "👁️ عرض المنشور" لمعاينة المحتوى كاملاً مع الصورة، أو اختر النشر المباشر:';

  return sendTelegramMessage({
    chatId,
    botToken,
    text: listText,
    replyMarkup: { inline_keyboard: buttons }
  });
}

/**
 * Dispatches a draft preview (with photo if available) directly to the specified chat.
 *
 * @param {string|number} draftId
 * @param {string|number} chatId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function dispatchDraftPreview(draftId, chatId = process.env.TELEGRAM_ALLOWED_USER_ID, options = {}) {
  const pendingDraftsPath = options.pendingDraftsPath || (fs.existsSync('/data/pending_drafts.json') ? '/data/pending_drafts.json' : 'data/pending_drafts.json');
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const drafts = loadPendingDrafts(pendingDraftsPath);

  let target = null;
  if (draftId && String(draftId).trim() !== '' && String(draftId) !== 'null' && String(draftId) !== 'undefined' && String(draftId) !== 'latest') {
    const sId = String(draftId).trim().toLowerCase();
    target = drafts.find(d => String(d.id) === sId) ||
             drafts.find(d => String(d.project || '').toLowerCase().includes(sId)) ||
             drafts.find(d => String(d.topic || '').toLowerCase().includes(sId));
  } else {
    target = drafts[drafts.length - 1];
  }

  if (!target) {
    if (drafts.length === 0) {
      return sendTelegramMessage({
        chatId,
        botToken,
        text: '⚠️ *لا توجد مسودات معلقة حالياً لعرضها.*\n\nاضغط /generate لتوليد مسودة جديدة لمشاريعك فوراً!',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '⚡ توليد مسودة الآن', callback_data: 'generate_new' }]
          ]
        }
      });
    }
    return sendTelegramMessage({
      chatId,
      botToken,
      text: `❌ المسودة أو المشروع المطلوب (${draftId || 'المحدد'}) غير موجود في قائمة الانتظار.`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📋 استعراض المسودات', callback_data: 'drafts' }]
        ]
      }
    });
  }

  const formattedCaption = `[Draft ID: #${target.id}]\n\n${target.text || target.post_text || ''}`;
  const inlineKeyboard = [
    [
      { text: `✅ نشر #${target.id}`, callback_data: `approve_${target.id}` },
      { text: `🗑️ حذف #${target.id}`, callback_data: `reject_${target.id}` },
    ],
    [
      { text: '📋 رجوع لقائمة المسودات', callback_data: 'drafts' },
      { text: '🔄 توليد جديد', callback_data: 'generate_new' }
    ]
  ];

  return sendPreviewMessage(target, {
    chatId,
    botToken,
    caption: formattedCaption,
    replyMarkup: { inline_keyboard: inlineKeyboard }
  });
}

// Allow CLI execution if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return null;
    const val = args[idx + 1];
    if (val.startsWith('--')) return null;
    return val;
  };

  const pendingDraftsPath =
    getArg('--drafts-file') ||
    (fs.existsSync('/data/pending_drafts.json') ? '/data/pending_drafts.json' : 'data/pending_drafts.json');

  if (args.includes('--list-drafts')) {
    const chatId = getArg('--list-drafts') || process.env.TELEGRAM_ALLOWED_USER_ID;
    dispatchDraftsList(chatId, { pendingDraftsPath })
      .then((res) => {
        console.log(JSON.stringify({ success: true, res }));
        process.exit(0);
      })
      .catch((err) => {
        console.error(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
      });
  } else if (args.includes('--show-draft')) {
    const draftId = getArg('--show-draft');
    const chatId = getArg('--chat-id') || process.env.TELEGRAM_ALLOWED_USER_ID;
    dispatchDraftPreview(draftId, chatId, { pendingDraftsPath })
      .then((res) => {
        console.log(JSON.stringify({ success: true, res }));
        process.exit(0);
      })
      .catch((err) => {
        console.error(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
      });
  } else if (args.includes('--help')) {
    console.log('Telegram Command Ingress Router');
    console.log('Usage:');
    console.log('  node scripts/telegram_router.js --list-drafts [chatId]');
    console.log('  node scripts/telegram_router.js --show-draft <id> [--chat-id <chatId>]');
    process.exit(0);
  }
}
