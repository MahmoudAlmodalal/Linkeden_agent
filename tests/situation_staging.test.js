import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildGroundedRAGPrompt,
} from '../scripts/rag_engine.js';
import {
  parseCommand,
  handleTelegramUpdate,
  loadScenarios,
  addScenario,
  loadBotState,
  getUserState,
  setUserState,
  clearUserState,
} from '../scripts/telegram_router.js';
import { runRAGStaging } from '../scripts/generate_rag_draft.js';

const TEST_DRAFTS_PATH = 'data/test_pending_drafts_situation.json';
const TEST_SCENARIOS_PATH = 'data/test_scenarios.json';
const TEST_STATE_PATH = 'data/test_bot_state.json';
const TEST_TOPIC_HISTORY_PATH = 'data/test_topic_history_situation.json';
const TEST_IMG_DIR = 'data/test_situation_images';

function cleanupTestFiles() {
  for (const p of [TEST_DRAFTS_PATH, TEST_SCENARIOS_PATH, TEST_STATE_PATH, TEST_TOPIC_HISTORY_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  if (fs.existsSync(TEST_IMG_DIR)) {
    fs.rmSync(TEST_IMG_DIR, { recursive: true, force: true });
  }
}

describe('Situation Prompt - System Prompt Grounding', () => {
  it('injects situation text into grounded prompt under dedicated section', () => {
    const customIncident = 'حدث انقطاع في الاتصال بـ Redis أثناء ذروة الطلبات مما سبب تراكم الـ locks في الذاكرة';
    const prompt = buildGroundedRAGPrompt({
      query: 'Redis lock outage',
      situation: customIncident,
      isEnglish: false,
    });

    assert.ok(prompt.includes('=== FEATURED REAL PRODUCTION SCENARIO (FROM AUTHOR) ==='));
    assert.ok(prompt.includes(customIncident));
    assert.ok(prompt.includes('Mahmoud H. Almodalal'));
    assert.ok(prompt.includes('MANDATORY FOCUS:'));
  });

  it('omits scenario section when no situation is provided', () => {
    const prompt = buildGroundedRAGPrompt({
      query: 'PostGIS spatial',
      situation: '',
      isEnglish: false,
    });

    assert.ok(!prompt.includes('=== FEATURED REAL PRODUCTION SCENARIO (FROM AUTHOR) ==='));
  });
});

describe('Situation Prompt - Telegram Command Parsing', () => {
  it('parses /situation with scenario text', () => {
    const text = '/situation واجهنا مشكلة في قاعدة البيانات عند التوسع لـ 100k مستخدم';
    const parsed = parseCommand(text);
    assert.equal(parsed.command, 'situation');
    assert.equal(parsed.prompt, 'واجهنا مشكلة في قاعدة البيانات عند التوسع لـ 100k مستخدم');
    assert.equal(parsed.draftId, null);
  });

  it('parses /incident alias with scenario text', () => {
    const text = '/incident Database deadlocks during concurrent migrations';
    const parsed = parseCommand(text);
    assert.equal(parsed.command, 'situation');
    assert.equal(parsed.prompt, 'Database deadlocks during concurrent migrations');
  });

  it('parses empty /situation command without argument', () => {
    const text = '/situation';
    const parsed = parseCommand(text);
    assert.equal(parsed.command, 'situation');
    assert.equal(parsed.prompt, null);
  });

  it('parses /cancel command', () => {
    const parsed = parseCommand('/cancel');
    assert.equal(parsed.command, 'cancel');
  });

  it('parses interactive touch button for situation', () => {
    const parsed = parseCommand('💡 موقف: حدث عطل في الـ celery workers');
    assert.equal(parsed.command, 'situation');
    assert.equal(parsed.prompt, 'حدث عطل في الـ celery workers');
  });
});

describe('Situation Prompt - Persistence & Bot State Management', () => {
  beforeEach(cleanupTestFiles);
  afterEach(cleanupTestFiles);

  it('tracks user state in bot_state.json', () => {
    const userId = 'test-authorized-user';
    setUserState(userId, { state: 'awaiting_situation' }, TEST_STATE_PATH);

    const retrieved = getUserState(userId, TEST_STATE_PATH);
    assert.ok(retrieved);
    assert.equal(retrieved.state, 'awaiting_situation');

    clearUserState(userId, TEST_STATE_PATH);
    const afterClear = getUserState(userId, TEST_STATE_PATH);
    assert.equal(afterClear, null);
  });

  it('archives scenarios to scenarios.json with incremental IDs', () => {
    const item1 = addScenario({
      situation: 'First scenario incident',
      submitted_by: 'test-authorized-user',
    }, TEST_SCENARIOS_PATH);

    const item2 = addScenario({
      situation: 'Second scenario incident',
      submitted_by: 'test-authorized-user',
    }, TEST_SCENARIOS_PATH);

    assert.equal(item1.id, 1);
    assert.equal(item2.id, 2);

    const list = loadScenarios(TEST_SCENARIOS_PATH);
    assert.equal(list.length, 2);
    assert.equal(list[0].situation, 'First scenario incident');
    assert.equal(list[1].situation, 'Second scenario incident');
  });
});

describe('Situation Prompt - Telegram Router Stateful Interaction', () => {
  beforeEach(cleanupTestFiles);
  afterEach(cleanupTestFiles);

  const allowedUserId = 'test-authorized-user';

  it('handles empty /situation by entering awaiting_situation state', async () => {
    const update = {
      message: {
        from: { id: 'test-authorized-user' },
        text: '/situation',
      },
    };

    const res = await handleTelegramUpdate(update, {
      allowedUserId,
      botStatePath: TEST_STATE_PATH,
      scenariosPath: TEST_SCENARIOS_PATH,
    });

    assert.equal(res.command, 'situation');
    assert.equal(res.waitingForInput, true);
    assert.ok(res.replyText.includes('كتابة فكرة أو سؤال تقني'));

    const state = getUserState(allowedUserId, TEST_STATE_PATH);
    assert.equal(state?.state, 'awaiting_situation');
  });

  it('consumes subsequent text message when awaiting_situation and triggers generation', async () => {
    setUserState(allowedUserId, { state: 'awaiting_situation' }, TEST_STATE_PATH);

    let triggeredPayload = null;
    const triggerWorkflow1 = async (payload) => {
      triggeredPayload = payload;
    };

    const update = {
      message: {
        from: { id: 'test-authorized-user' },
        text: 'انقطاع كامل في خدمة التنبيهات بسبب تجاوز الـ rate limit في FCM',
      },
    };

    const res = await handleTelegramUpdate(update, {
      allowedUserId,
      triggerWorkflow1,
      botStatePath: TEST_STATE_PATH,
      scenariosPath: TEST_SCENARIOS_PATH,
    });

    assert.equal(res.command, 'situation');
    assert.ok(res.replyText.includes('تم استلام الفكرة التقنية'));
    assert.ok(triggeredPayload);
    assert.equal(triggeredPayload.situation, 'انقطاع كامل في خدمة التنبيهات بسبب تجاوز الـ rate limit في FCM');

    // User state must be cleared
    const state = getUserState(allowedUserId, TEST_STATE_PATH);
    assert.equal(state, null);

    // Scenario must be saved in scenarios.json
    const scenarios = loadScenarios(TEST_SCENARIOS_PATH);
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].situation, 'انقطاع كامل في خدمة التنبيهات بسبب تجاوز الـ rate limit في FCM');
  });

  it('allows canceling while in awaiting_situation state via /cancel', async () => {
    setUserState(allowedUserId, { state: 'awaiting_situation' }, TEST_STATE_PATH);

    const update = {
      message: {
        from: { id: 'test-authorized-user' },
        text: '/cancel',
      },
    };

    const res = await handleTelegramUpdate(update, {
      allowedUserId,
      botStatePath: TEST_STATE_PATH,
      scenariosPath: TEST_SCENARIOS_PATH,
    });

    assert.equal(res.command, 'cancel');
    assert.ok(res.replyText.includes('إلغاء'));

    const state = getUserState(allowedUserId, TEST_STATE_PATH);
    assert.equal(state, null);
  });

  it('auto-detects direct long text as a situation prompt without command', async () => {
    let triggeredPayload = null;
    const triggerWorkflow1 = async (payload) => {
      triggeredPayload = payload;
    };

    const incidentText = 'أثناء تشغيل الـ Data Migration واجهنا مشكلة deadlock في جدول الفواتير بسبب تعارض التحديثات المتزامنة';

    const update = {
      message: {
        from: { id: 'test-authorized-user' },
        text: incidentText,
      },
    };

    const res = await handleTelegramUpdate(update, {
      allowedUserId,
      triggerWorkflow1,
      botStatePath: TEST_STATE_PATH,
      scenariosPath: TEST_SCENARIOS_PATH,
    });

    assert.equal(res.command, 'situation');
    assert.ok(triggeredPayload);
    assert.equal(triggeredPayload.situation, incidentText);
  });
});

describe('Situation Prompt - Staging & Visual Card Generation', () => {
  beforeEach(cleanupTestFiles);
  afterEach(cleanupTestFiles);

  it('stages supplied text as a general Django/backend topic and generates a fresh branded card', async () => {
    let callCount = 0;
    const mockClient = {
      interactions: {
        create: async ({ input }) => {
          callCount += 1;
          if (callCount === 1) {
            assert.ok(input.includes("USER'S TECHNICAL SEED"));
            assert.ok(input.includes('NOT A VERIFIED PERSONAL ACCOUNT'));
            assert.ok(input.includes('Django/Python backend lens'));
            assert.ok(input.includes('Memory leak caused by unclosed DB connections'));
            return {
              output_text:
                'في Django، إرسال المهمة إلى Celery قبل تثبيت المعاملة قد يجعل العامل يقرأ بيانات غير موجودة بعد.\n\n' +
                'استخدم transaction.on_commit لتأخير الإرسال، واجعل المهمة idempotent لأن وسيط الرسائل قد يعيد التسليم.\n\n' +
                'هذا يحافظ على مسار الطلب قصيرًا، لكنه لا يغني عن outbox إذا كان فقدان الرسالة غير مقبول.\n\n' +
                'كيف تضمنون اتساق الكتابة مع المهام الخلفية؟ #Django #Celery #Backend #PostgreSQL',
            };
          }
          return {
            output_text: JSON.stringify({
              title: 'اتساق Django مع المهام الخلفية',
              highlight: 'on_commit وidempotency',
              pill: 'Django Backend',
              steps: [
                'أرسل مهمة Celery بعد transaction.on_commit',
                'اجعل إعادة التسليم idempotent',
                'استخدم outbox عندما يلزم ضمان تسليم الرسالة',
              ],
            }),
          };
        },
      },
    };

    const res = await runRAGStaging({
      situation: 'Memory leak caused by unclosed DB connections during high traffic',
      client: mockClient,
      draftsPath: TEST_DRAFTS_PATH,
      scenariosPath: TEST_SCENARIOS_PATH,
      topicHistoryPath: TEST_TOPIC_HISTORY_PATH,
      outputDir: TEST_IMG_DIR,
      useBrandedCard: true,
    });

    assert.equal(res.success, true);
    assert.ok(res.draft);
    assert.equal(res.draft.situation, null);
    assert.equal(res.draft.project, null);
    assert.equal(res.draft.visual_source, 'branded_card');
    assert.ok(fs.existsSync(res.draft.image_path));

    // General idea seeds are not mislabeled as verified personal incidents.
    const scenarios = loadScenarios(TEST_SCENARIOS_PATH);
    assert.equal(scenarios.length, 0);
  });
});
