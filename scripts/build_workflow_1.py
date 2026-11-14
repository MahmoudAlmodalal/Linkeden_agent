import json
import os

js_code = r"""const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const input = $input.first().json;
const draftId = input.draftId || 1;
const query = input.query || '';
const situation = input.situation || '';

let postText = '';
let imagePath = null;
let project = 'portfolio';
let executionError = null;
let imageError = null;

try {
  const args = ['/scripts/generate_rag_draft.js', '--id', String(draftId)];
  if (query) args.push('--query', query);
  if (situation) args.push('--situation', situation);
  const combined = `${query} ${situation}`.toLowerCase();
  const wantsProjectImage = /صورة\s*(?:الـ|لـ)?مشروع|صورة\s*المشروع|project[\s_-]*image|screenshot/i.test(combined);
  if (wantsProjectImage) {
    args.push('--project-image');
  }
  const envKeys = [
    'PATH', 'HOME', 'TZ', 'NODE_PATH', 'NODE_ENV',
    'CHROME_BIN', 'PUPPETEER_EXECUTABLE_PATH',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY', 'OPENROUTER_TEXT_MODEL',
    'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_TEXT_MODEL', 'CLOUDFLARE_IMAGE_MODEL',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_ID',
  ];
  const childEnv = {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/home/node',
  };
  for (const key of envKeys) {
    if ($env[key] !== undefined && $env[key] !== null && $env[key] !== '') {
      childEnv[key] = String($env[key]);
    }
  }
  const child = await new Promise((resolve, reject) => {
    const proc = spawn('node', args, { cwd: '/', env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error('RAG process timed out after 120000ms'));
    }, 120000);
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  if (child.status !== 0) {
    const errOut = (child.stderr || child.stdout || '').trim();
    throw new Error(errOut || `RAG process exited with ${child.status}`);
  }
  const result = JSON.parse(child.stdout);
  if (result.success && result.draft) {
    postText = result.draft.text;
    imagePath = result.draft.image_path;
    project = result.draft.project;
    imageError = result.imageError || null;
  } else {
    throw new Error(result.error || 'RAG draft generation returned unsuccessful status');
  }
} catch (err) {
  executionError = err.message;
  console.error('RAG draft execution error:', err.message);
}

const allowedChatId = $env.TELEGRAM_ALLOWED_USER_ID;
if (!allowedChatId) throw new Error('TELEGRAM_ALLOWED_USER_ID is required to dispatch a draft');

if (executionError || !postText) {
  const rawReason = String(executionError || 'لم يتم توليد نص للمنشور من النموذج').trim();
  const reason = rawReason.length > 1500 ? `${rawReason.slice(0, 1500)}...` : rawReason;
  return [{
    json: {
      id: draftId,
      project,
      error: true,
      hasImage: false,
      text: `❌ فشل توليد المسودة #${draftId}\n\nالسبب:\n${reason}\n\nتحقق من مفاتيح الربط (Gemini/Cloudflare) وسجلات الخادم.`,
      caption: `❌ فشل توليد المسودة #${draftId}: ${reason}`,
    }
  }];
}

if (!imagePath) {
  const projectAsset = `/assets/${String(project).toLowerCase()}.webp`;
  imagePath = fs.existsSync(projectAsset)
    ? projectAsset
    : (fs.existsSync('/assets/2wash.webp') ? '/assets/2wash.webp' : null);
}

let resolvedImagePath = null;
if (imagePath) {
  const candidate = path.isAbsolute(imagePath) ? imagePath : path.resolve('/', imagePath);
  if (fs.existsSync(candidate)) {
    resolvedImagePath = candidate;
  }
}

const imageWarning = imageError
  ? `\n\n⚠️ تعذر توليد الصورة المخصصة (السبب: ${String(imageError).slice(0, 500)})`
  : '';

const previewCaption = `[Draft ID: #${draftId}]\n\n` +
  `تم توليد مسودة كاملة عن ${project}. ستصل الرسالة الكاملة بعد الصورة.`;

if (!resolvedImagePath) {
  return [{
    json: {
      id: draftId,
      project: project,
      error: false,
      hasImage: false,
      text: `${postText}${imageWarning || '\n\n⚠️ لم يتم إرفاق صورة لهذه المسودة.'}`,
      image_path: null,
      caption: previewCaption
    }
  }];
}

const extension = path.extname(resolvedImagePath).toLowerCase();
const mimeType = extension === '.png' ? 'image/png' : (extension === '.webp' ? 'image/webp' : 'image/jpeg');

return [{
  json: {
    id: draftId,
    project: project,
    error: false,
    hasImage: true,
    text: `${postText}${imageWarning}`,
    image_path: imagePath,
    caption: previewCaption
  },
  binary: {
    photo: {
      data: fs.readFileSync(resolvedImagePath).toString('base64'),
      fileName: path.basename(resolvedImagePath),
      mimeType
    }
  }
}];"""

wf = {
  "id": "workflow-1-staging",
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
        "conditions": {
          "options": {
            "caseSensitive": True,
            "leftValue": "",
            "typeValidation": "loose"
          },
          "conditions": [
            {
              "leftValue": "={{ Boolean($json.hasImage) && !$json.error }}",
              "rightValue": True,
              "operator": {
                "type": "boolean",
                "operation": "true",
                "singleValue": True
              }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "7b8d4c9a-4555-4444-8888-000000000008",
      "name": "Has Generated Photo?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [830, 340]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/sendPhoto' }}",
        "sendBody": True,
        "contentType": "multipart-form-data",
        "bodyParameters": {
          "parameters": [
            { "name": "chat_id", "value": "={{ $env.TELEGRAM_ALLOWED_USER_ID }}" },
            { "name": "caption", "value": "={{ $json.caption }}" },
            { "parameterType": "formBinaryData", "name": "photo", "inputDataFieldName": "photo" }
          ]
        },
        "options": {}
      },
      "id": "7b8d4c9a-5555-4444-8888-000000000005",
      "name": "Telegram Send Photo",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [960, 340],
      "continueOnFail": True
    },
    {
      "parameters": {
        "jsCode": "const generated = $('Gemini Generation & Visual Stager').first();\nreturn [{ json: generated.json }];"
      },
      "id": "7b8d4c9a-7777-4444-8888-000000000007",
      "name": "Restore Draft Text After Photo",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1090, 340]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/sendMessage' }}",
        "sendBody": True,
        "bodyParameters": {
          "parameters": [
            { "name": "chat_id", "value": "={{ $env.TELEGRAM_ALLOWED_USER_ID }}" },
            { "name": "text", "value": "={{ $json.text }}" }
          ]
        },
        "options": {}
      },
      "id": "7b8d4c9a-6666-4444-8888-000000000006",
      "name": "Telegram Send Full Post",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1220, 340],
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
      "main": [[{"node": "Has Generated Photo?", "type": "main", "index": 0}]]
    },
    "Has Generated Photo?": {
      "main": [
        [{"node": "Telegram Send Photo", "type": "main", "index": 0}],
        [{"node": "Telegram Send Full Post", "type": "main", "index": 0}]
      ]
    },
    "Telegram Send Photo": {
      "main": [[{"node": "Restore Draft Text After Photo", "type": "main", "index": 0}]]
    },
    "Restore Draft Text After Photo": {
      "main": [[{"node": "Telegram Send Full Post", "type": "main", "index": 0}]]
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
