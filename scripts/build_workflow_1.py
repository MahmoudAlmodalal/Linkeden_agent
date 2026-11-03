import json
import os

js_code = r"""const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const input = $input.first().json;
const draftId = input.draftId || 1;
const query = input.query || '';
const situation = input.situation || '';

let postText = '';
let imagePath = null;
let project = 'portfolio';

try {
  const queryArg = query ? `--query "${query.replace(/"/g, '\\"')}"` : '';
  const sitArg = situation ? `--situation "${situation.replace(/"/g, '\\"')}"` : '';
  const cmd = `node /scripts/generate_rag_draft.js ${queryArg} ${sitArg} --id ${draftId}`;
  const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
  const result = JSON.parse(out);
  if (result.success && result.draft) {
    postText = result.draft.text;
    imagePath = result.draft.image_path;
    project = result.draft.project;
  }
} catch (err) {
  console.error('RAG draft execution error:', err.message);
}

// Fallback if RAG script execution had an issue
if (!postText) {
  postText = `استخدام DB::transaction وحده لا يحمي تطبيقك من الـ Race Conditions إذا لم تقفل السجلات أثناء القراءة.\n\n` +
    `في أحد مشاريع معالجة المدفوعات والاشتراكات، ظهرت مشكلة دقيقة: رصيد العميل ينزل إلى قيمة سالبة عند إرسال طلبين في نفس الجزء من الثانية، أو يتم شحن نفس كود التفعيل مرتين.\n\n` +
    `الافتراض الأول كان وجود خطأ في الـ Frontend يسمح بالضغط المزدوج على زر التأكيد، أو خلل في الـ Queue Worker الذي يعالج العملية.\n\n` +
    `قمت بكتابة اختبار آلي يحاكي طلبين متزامنين على نفس الحساب للتأكد من المشكلة. المفاجأة كانت أن كل شيء يعمل داخل DB::transaction بشكل سليم نظريا، لكن السجلات كانت تقرأ نفس الرصيد القديم قبل انتهاء المعاملة الأولى.\n\n` +
    `السبب الجذري: الـ Transaction تضمن الذرية (Atomicity) فقط، لكنها لا تمنع العمليات الأخرى من قراءة القيمة الحالية إذا لم تستخدم Lock صريحا.\n\n` +
    `الحل كان في خطوتين مباشرتين:\n` +
    `1. استخدام Pessimistic Locking عبر استدعاء lockForUpdate عند جلب سجل الرصيد داخل المعاملة، لمنع أي عملية أخرى من قراءته أو تعديله حتى اكتمال التحديث.\n` +
    `2. الاعتماد على العمليات الذرية المباشرة في قاعدة البيانات مثل decrement بدلا من قراءة القيمة وتعديلها في الذاكرة ثم حفظها.\n\n` +
    `بعد تعديل الكود، أعدت تشغيل الاختبار وأثبت فشل أي محاولة خصم مزدوج مع حماية تامة للبيانات.\n\n` +
    `الدرس الهندسي: لا تعتمد على حماية الواجهة لمنع تكرار العمليات الحساسة، وقاعدة البيانات هي خط الدفاع الحقيقي الوحيد.\n\n` +
    `كيف تتعامل مع معالجة الرصيد والعمليات المالية المتزامنة في مشاريعك؟\n` +
    `اكتبوا لنا في التعليقات 👇\n\n` +
    `#Laravel #PHP #WebDevelopment #DatabaseDesign #SoftwareEngineering`;
}

if (!imagePath) {
  imagePath = '/assets/2wash.webp';
}

const safeCaption = postText.length > 900
  ? `[Draft ID: #${draftId}]\n\n` + postText.slice(0, 850) + '...'
  : `[Draft ID: #${draftId}]\n\n` + postText;

const botToken = process.env.TELEGRAM_BOT_TOKEN || '[removed-token]';
const chatId = process.env.TELEGRAM_ALLOWED_USER_ID || '1565239721';

try {
  execSync(`node /scripts/telegram_router.js --show-draft ${draftId} --chat-id ${chatId}`, { encoding: 'utf8', timeout: 15000 });
} catch (tgErr) {
  console.error('Telegram dispatch error:', tgErr.message);
}

return [{
  json: {
    id: draftId,
    project: project,
    text: postText,
    image_path: imagePath,
    caption: safeCaption
  }
}];"""

wf = {
  "name": "Workflow 1 - Content Generator & Stager",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 10 * * 0-4"
            }
          ]
        }
      },
      "id": "7b8d4c9a-1111-4444-8888-000000000001",
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [180, 240]
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "generate",
        "options": {}
      },
      "id": "7b8d4c9a-2222-4444-8888-000000000002",
      "name": "Webhook Trigger (/generate)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [180, 440],
      "webhookId": "generate-staging-run"
    },
    {
      "parameters": {
        "jsCode": "const fs = require('fs');\nconst path = require('path');\n\nconst input = $input.first().json;\nconst incomingQuery = input.query || input.body?.query || '';\nconst incomingSituation = input.situation || input.body?.situation || '';\n\nconst draftsPath = '/data/pending_drafts.json';\nlet drafts = [];\nif (fs.existsSync(draftsPath)) {\n  try {\n    drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));\n    if (!Array.isArray(drafts)) drafts = [];\n  } catch (err) {\n    drafts = [];\n  }\n}\n\nconst maxId = drafts.reduce((max, d) => Math.max(max, Number(d.id) || 0), 0);\nconst nextDraftId = maxId + 1;\n\nreturn [\n  {\n    json: {\n      draftId: nextDraftId,\n      query: incomingQuery,\n      situation: incomingSituation,\n      draftsPath\n    }\n  }\n];"
      },
      "id": "7b8d4c9a-3333-4444-8888-000000000003",
      "name": "Topic Selector",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 340]
    },
    {
      "parameters": {
        "jsCode": js_code
      },
      "id": "7b8d4c9a-4444-4444-8888-000000000004",
      "name": "Gemini Generation & Visual Stager",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [700, 340]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "sendPhoto",
        "chatId": "={{ $env.TELEGRAM_ALLOWED_USER_ID }}",
        "file": "={{ $json.image_path }}",
        "caption": "={{ $json.caption }}",
        "additionalFields": {}
      },
      "id": "7b8d4c9a-5555-4444-8888-000000000005",
      "name": "Telegram Send Photo",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [960, 340],
      "continueOnFail": True
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [[{"node": "Topic Selector", "type": "main", "index": 0}]]
    },
    "Webhook Trigger (/generate)": {
      "main": [[{"node": "Topic Selector", "type": "main", "index": 0}]]
    },
    "Topic Selector": {
      "main": [[{"node": "Gemini Generation & Visual Stager", "type": "main", "index": 0}]]
    },
    "Gemini Generation & Visual Stager": {
      "main": [[{"node": "Telegram Send Photo", "type": "main", "index": 0}]]
    }
  },
  "active": True,
  "settings": {
    "executionOrder": "v1"
  }
}

with open('workflows/workflow_1_staging.json', 'w') as f:
    json.dump(wf, f, indent=2)

print('Successfully generated workflow_1_staging.json with Portfolio RAG grounding')
