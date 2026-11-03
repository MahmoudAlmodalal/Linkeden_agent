import fs from 'node:fs';
import path from 'node:path';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
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
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not defined in environment or .env');
  process.exit(1);
}

const commands = [
  { command: 'situation', description: '💡 كتابة موقف أو معضلة وتوليد بوست وصورة' },
  { command: 'show', description: '👁️ عرض المنشور الحالي مع الصورة المعمارية' },
  { command: 'drafts', description: '📋 عرض قائمة المسودات والمنشورات' },
  { command: 'generate', description: '⚡ توليد منشور وصورة معمارية جديدة' },
  { command: 'approve', description: '✅ اعتماد ونشر المنشور على LinkedIn' },
  { command: 'reject', description: '🗑️ حذف منشور من القائمة المعلقة' },
  { command: 'help', description: 'ℹ️ المساعدة والتعليمات' },
];

/**
 * Registers commands with Telegram Bot API across all scopes (default, all_private_chats, user chat).
 */
export async function registerTelegramCommands(token = botToken, allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID) {
  const scopes = [
    { type: 'default' },
    { type: 'all_private_chats' },
  ];
  if (allowedUserId) {
    scopes.push({ type: 'chat', chat_id: Number(allowedUserId) || allowedUserId });
  }

  let lastResult = null;
  for (const scope of scopes) {
    // Default language
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, scope }),
    });
    lastResult = await res.json();

    // Arabic language code
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, scope, language_code: 'ar' }),
    });
  }

  // Also configure chat menu button specifically for the allowed user chat and globally
  await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  });

  if (allowedUserId) {
    await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(allowedUserId) || allowedUserId,
        menu_button: { type: 'commands' },
      }),
    });
  }

  return lastResult;
}

// If executed directly from CLI
if (process.argv[1] && process.argv[1].endsWith('setup_telegram_menu.js')) {
  registerTelegramCommands()
    .then((res) => {
      console.log('✅ Telegram bot commands menu registered successfully:', res);
      console.log('Commands configured:');
      commands.forEach((c) => console.log(` • /${c.command} - ${c.description}`));
    })
    .catch((err) => {
      console.error('❌ Failed to register commands:', err.message);
      process.exit(1);
    });
}
