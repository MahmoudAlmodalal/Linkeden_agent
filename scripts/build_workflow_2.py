import json

js_security = r"""const body = $input.item.json.body || $input.item.json;
const callback = body.callback_query;
let fromId = '';
let chatId = '';
let text = '';

if (callback) {
  fromId = String(callback.from?.id || '');
  chatId = callback.message?.chat?.id || fromId;
  text = callback.data || '';
} else {
  const message = body.message || body.edited_message || {};
  fromId = String(message.from?.id || '');
  chatId = message.chat?.id || fromId;
  text = (message.text || '').trim();
}

const allowedId = String(process.env.TELEGRAM_ALLOWED_USER_ID || '').trim();

if (!fromId || !allowedId || fromId !== allowedId) {
  return [{
    json: {
      authorized: false,
      chatId,
      text,
      command: 'unauthorized',
      replyText: '⛔ Unauthorized: Telegram User ID not authorized.'
    }
  }];
}

let command = 'unknown';
let draftId = null;

if (text.startsWith('approve:') || /^(?:\/approve(?:@\w+)?)(?:\s|$)/u.test(text) || text.startsWith('✅ نشر')) {
  command = 'approve';
  if (text.startsWith('approve:')) {
    draftId = text.split(':')[1];
  } else {
    const numMatch = text.match(/#?(\d+)/);
    if (numMatch) draftId = numMatch[1];
  }
} else if (text.startsWith('reject:') || /^(?:\/reject(?:@\w+)?)(?:\s|$)/u.test(text) || text.startsWith('🗑️ رفض') || text.startsWith('❌ رفض')) {
  command = 'reject';
  if (text.startsWith('reject:')) {
    draftId = text.split(':')[1];
  } else {
    const numMatch = text.match(/#?(\d+)/);
    if (numMatch) draftId = numMatch[1];
  }
} else if (
  text.startsWith('show:') ||
  text.startsWith('/show') ||
  text.startsWith('/preview') ||
  text.startsWith('/post') ||
  text.startsWith('/project') ||
  text.includes('عرض مسودة') ||
  text.includes('عرض المنشور') ||
  text.includes('عرض المناشير') ||
  text.includes('عرض مشروع') ||
  text.includes('عرض المشروع') ||
  text.includes('عرض مشاريع') ||
  text.includes('عرض المشاريع') ||
  text.includes('المشاريع') ||
  text.includes('مشاريع') ||
  text.startsWith('مشروع') ||
  text.includes('معاينة') ||
  text.startsWith('👁️')
) {
  command = 'show';
  if (text.startsWith('show:')) {
    draftId = text.split(':')[1];
  } else {
    const numMatch = text.match(/#?(\d+)/);
    if (numMatch) {
      draftId = numMatch[1];
    } else {
      const cleaned = text
        .replace(/^(?:\/show|\/preview|\/post|\/project|\/projects|👁️|عرض مسودة|عرض المنشور|عرض المناشير|عرض مشروع|عرض المشروع|عرض مشاريع|عرض المشاريع|المشاريع|مشاريع|مشروع|معاينة)\s*/iu, '')
        .trim();
      if (cleaned && !cleaned.startsWith('#')) {
        draftId = cleaned;
      }
    }
  }
} else if (
  text.startsWith('/drafts') ||
  text === 'drafts' ||
  text.startsWith('/draft') ||
  text === 'draft' ||
  text.startsWith('/grafs') ||
  text === 'grafs' ||
  text.startsWith('/graf') ||
  text === 'graf' ||
  text.includes('/drafts') ||
  text.includes('/grafs') ||
  text.startsWith('📋 عرض') ||
  text.includes('المسودات') ||
  text.includes('المنشورات')
) {
  command = 'drafts';
} else if (text.startsWith('/generate') || text === 'generate' || text.includes('/generate') || text.startsWith('⚡ توليد')) {
  command = 'generate';
} else if (text.startsWith('/help') || text === 'help' || text === '/start' || text.includes('/help') || text.startsWith('ℹ️ المساعدة')) {
  command = 'help';
} else {
  command = 'help';
}

return [{
  json: {
    authorized: true,
    command,
    draftId,
    chatId,
    rawText: text
  }
}];"""

js_drafts = r"""const fs = require('fs');
const prev = $('Security & Command Parser').first().json;
const chatId = prev.chatId;

let drafts = [];
try {
  const filePath = '/data/pending_drafts.json';
  if (fs.existsSync(filePath)) {
    drafts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(drafts)) drafts = [];
  }
} catch (e) {
  drafts = [];
}

let replyText = '';
let replyMarkup = { remove_keyboard: true };

if (drafts.length === 0) {
  replyText = '⚠️ *لا توجد مسودات معلقة حالياً.*\n\nاضغط /generate لتوليد منشور جديد!';
  replyMarkup = {
    inline_keyboard: [
      [{ text: '⚡ توليد مسودة الآن', callback_data: 'generate' }]
    ]
  };
} else {
  const displayDrafts = drafts.slice(-10).reverse();
  const buttons = [];
  replyText = `📋 *قائمة المسودات المتوفرة في النظام (${drafts.length}):*\n\n`;
  for (const d of displayDrafts) {
    const topic = d.topic || 'بوست تقني';
    const preview = (d.text || d.post_text || '').slice(0, 60).replace(/\n/g, ' ');
    replyText += `• *مسودة #${d.id}* (${topic}):\n  _${preview}..._\n\n`;
    buttons.push([
      { text: `👁️ عرض المنشور #${d.id}`, callback_data: `show:${d.id}` },
      { text: `✅ نشر #${d.id}`, callback_data: `approve:${d.id}` },
      { text: `🗑️ حذف #${d.id}`, callback_data: `reject:${d.id}` }
    ]);
  }
  buttons.push([{ text: '⚡ توليد مسودة جديدة', callback_data: 'generate' }]);
  replyText += '👇 اضغط "👁️ عرض المنشور" لمعاينة المحتوى، أو اختر النشر المباشر:';
  replyMarkup = { inline_keyboard: buttons };
}

return [{
  json: {
    chatId,
    replyText,
    replyMarkup
  }
}];"""

js_show = r"""const { execSync } = require('child_process');
const prev = $('Security & Command Parser').first().json;
const chatId = prev.chatId;
const draftId = prev.draftId || 'latest';

try {
  execSync(`node /scripts/telegram_router.js --show-draft "${draftId}" --chat-id "${chatId}"`, { encoding: 'utf8', timeout: 15000 });
} catch (e) {
  console.error('Show dispatch error:', e.message);
}

return [{
  json: {
    chatId,
    replyText: ''
  }
}];"""

js_help = r"""const prev = $('Security & Command Parser').first().json;
const chatId = prev.chatId;

const helpMsg = `🤖 *دليل أوامر بوت النشر على LinkedIn:*

1️⃣ */show* أو *عرض مشروع* : عرض المنشور الحالي مع الصورة المعمارية بالكامل.
2️⃣ */drafts* أو *المسودات* : عرض قائمة بجميع المسودات المحفوظة مع أزرار لمعاينة أي منها.
3️⃣ */generate* أو *توليد* : توليد منشور هندسي جديد وصورة معمارية فوراً.
4️⃣ */approve [id]* : اعتماد المسودة ونشرها مباشرة على LinkedIn.
5️⃣ */reject [id]* : حذف المسودة من قائمة الانتظار.

✨ _استخدم زر القائمة [/] بجانب حقل الرسالة أو اكتب اسم مشروعك لعرضه بسهولة!_`;

return [{
  json: {
    chatId,
    replyText: helpMsg
  }
}];"""

wf2 = {
  "id": "workflow-2-publishing",
  "name": "Workflow 2 - LinkedIn Publishing & Telegram Command Handler",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "telegram-webhook",
        "options": {}
      },
      "id": "webhook-telegram",
      "name": "Telegram Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [100, 300],
      "webhookId": "telegram-webhook"
    },
    {
      "parameters": {
        "jsCode": js_security
      },
      "id": "security-check",
      "name": "Security & Command Parser",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [320, 300]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "approve", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "reject", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "generate", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "drafts", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "show", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": { "caseSensitive": True, "leftValue": "", "typeValidation": "strict" },
                "conditions": [{ "leftValue": "={{ $json.command }}", "rightValue": "help", "operator": { "type": "string", "operation": "equals" } }],
                "combinator": "and"
              }
            }
          ]
        }
      },
      "id": "command-router",
      "name": "Command Router",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [540, 300]
    },
    {
      "parameters": {
        "jsCode": "const { execSync } = require('child_process');\nconst draftId = $input.item.json.draftId || '';\nlet stdout = '';\nlet stderr = '';\ntry {\n  stdout = execSync(`node /scripts/linkedin_publisher.js ${draftId}`, { encoding: 'utf8' });\n} catch (err) {\n  stderr = err.stderr || err.message || '';\n  stdout = err.stdout || '';\n}\nreturn [{ json: { stdout, stderr } }];"
      },
      "id": "linkedin-publishing-node",
      "name": "LinkedIn Publishing Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 100],
      "continueOnFail": True
    },
    {
      "parameters": {
        "jsCode": "const stdout = $input.item.json.stdout || '';\nconst stderr = $input.item.json.stderr || '';\nlet result = {};\ntry { result = JSON.parse(stdout); } catch { result = { success: false, error: stderr || stdout || 'Unknown error' }; }\nconst prev = $('Security & Command Parser').first().json;\nconst chatId = prev.chatId;\nlet replyText = '';\nif (result.success) {\n  replyText = `✅ *تم النشر بنجاح على LinkedIn!*\\n\\n*رقم المسودة:* #${result.draftId}\\n*رابط المنشور الحي:* ${result.liveUrl}`;\n} else {\n  const draftId = result.draftId || prev.draftId || 'latest';\n  replyText = `❌ *فشل النشر للمسودة #${draftId}*\\n\\n*الخطأ:* ${result.error}\\n\\n_تم الاحتفاظ بالمسودة في النظام للمحاولة لاحقاً._`;\n}\nreturn [{ json: { chatId, replyText } }];"
      },
      "id": "format-publish-reply",
      "name": "Format Publishing Reply",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1000, 100]
    },
    {
      "parameters": {
        "jsCode": "const fs = require('fs');\nconst filePath = '/data/pending_drafts.json';\nconst prev = $('Security & Command Parser').first().json;\nconst draftId = prev.draftId;\nconst chatId = prev.chatId;\nlet replyText = '';\ntry {\n  if (fs.existsSync(filePath)) {\n    const drafts = JSON.parse(fs.readFileSync(filePath, 'utf8'));\n    const remaining = drafts.filter(d => String(d.id) !== String(draftId));\n    fs.writeFileSync(filePath, JSON.stringify(remaining, null, 2), 'utf8');\n    replyText = `🗑️ *تم حذف المسودة #${draftId || 'المحددة'} من النظام.*`;\n  } else { replyText = '⚠️ لا توجد مسودات لحذفها.'; }\n} catch (e) { replyText = `❌ خطأ في الحذف: ${e.message}`; }\nreturn [{ json: { chatId, replyText } }];"
      },
      "id": "handle-reject-node",
      "name": "Handle Rejection Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 240]
    },
    {
      "parameters": {
        "jsCode": "const { execSync } = require('child_process');\nconst prev = $('Security & Command Parser').first().json;\nconst chatId = prev.chatId;\ntry { execSync('wget -q -O- --post-data=\"\" http://127.0.0.1:5678/webhook/generate > /dev/null 2>&1 &'); } catch (e) {}\nreturn [{ json: { chatId, replyText: '⚡ *جارٍ توليد منشور جديد وصورة بالذكاء الاصطناعي...*\\n\\nستصلك المسودة هنا بعد ثوانٍ قليلة!' } }];"
      },
      "id": "handle-generate-node",
      "name": "Handle Generate Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 380]
    },
    {
      "parameters": {
        "jsCode": js_drafts
      },
      "id": "handle-drafts-node",
      "name": "Handle Drafts Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 520]
    },
    {
      "parameters": {
        "jsCode": js_show
      },
      "id": "handle-show-node",
      "name": "Handle Show Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 660]
    },
    {
      "parameters": {
        "jsCode": js_help
      },
      "id": "handle-help-node",
      "name": "Handle Help Node",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [780, 800]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/sendMessage' }}",
        "sendBody": True,
        "bodyParameters": {
          "parameters": [
            { "name": "chat_id", "value": "={{ $json.chatId }}" },
            { "name": "text", "value": "={{ $json.replyText }}" },
            { "name": "parse_mode", "value": "Markdown" },
            { "name": "reply_markup", "value": "={{ $json.replyMarkup ? (typeof $json.replyMarkup === 'string' ? $json.replyMarkup : JSON.stringify($json.replyMarkup)) : JSON.stringify({\"remove_keyboard\": true}) }}" }
          ]
        },
        "options": {}
      },
      "id": "telegram-reply-node",
      "name": "Telegram Reply Node",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1240, 300]
    }
  ],
  "connections": {
    "Telegram Webhook Trigger": {
      "main": [[{ "node": "Security & Command Parser", "type": "main", "index": 0 }]]
    },
    "Security & Command Parser": {
      "main": [[{ "node": "Command Router", "type": "main", "index": 0 }]]
    },
    "Command Router": {
      "main": [
        [{ "node": "LinkedIn Publishing Node", "type": "main", "index": 0 }],
        [{ "node": "Handle Rejection Node", "type": "main", "index": 0 }],
        [{ "node": "Handle Generate Node", "type": "main", "index": 0 }],
        [{ "node": "Handle Drafts Node", "type": "main", "index": 0 }],
        [{ "node": "Handle Show Node", "type": "main", "index": 0 }],
        [{ "node": "Handle Help Node", "type": "main", "index": 0 }]
      ]
    },
    "LinkedIn Publishing Node": {
      "main": [[{ "node": "Format Publishing Reply", "type": "main", "index": 0 }]]
    },
    "Format Publishing Reply": {
      "main": [[{ "node": "Telegram Reply Node", "type": "main", "index": 0 }]]
    },
    "Handle Rejection Node": {
      "main": [[{ "node": "Telegram Reply Node", "type": "main", "index": 0 }]]
    },
    "Handle Generate Node": {
      "main": [[{ "node": "Telegram Reply Node", "type": "main", "index": 0 }]]
    },
    "Handle Drafts Node": {
      "main": [[{ "node": "Telegram Reply Node", "type": "main", "index": 0 }]]
    },
    "Handle Show Node": {
      "main": []
    },
    "Handle Help Node": {
      "main": [[{ "node": "Telegram Reply Node", "type": "main", "index": 0 }]]
    }
  },
  "active": True,
  "settings": {
    "executionOrder": "v1"
  }
}

with open('workflows/workflow_2_publishing.json', 'w') as f:
    json.dump(wf2, f, indent=2)

print('Generated enhanced workflow_2_publishing.json with full menu & visual browsing!')
