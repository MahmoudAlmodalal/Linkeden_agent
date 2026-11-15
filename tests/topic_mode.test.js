import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TOPIC_AREAS,
  loadTopicHistory,
  saveTopicToHistory,
  isDuplicateTopic,
  pickArea,
  chooseLanguage,
  proposeTopic,
  buildTopicIdeaPrompt,
  buildTopicPostPrompt,
  topicFromTechnicalSeed,
} from '../scripts/topic_mode.js';
import { buildContentPrompt } from '../scripts/gemini_engine.js';
import { runRAGStaging } from '../scripts/generate_rag_draft.js';

describe('Topic Mode - General Technical Topics', () => {
  it('rotates least recently used area and alternates ar/en languages', () => {
    assert.equal(pickArea([]), TOPIC_AREAS[0]);
    assert.equal(chooseLanguage([]), 'ar');
    assert.equal(chooseLanguage([{ language: 'ar' }]), 'en');
    assert.equal(chooseLanguage([{ language: 'en' }]), 'ar');

    const history = TOPIC_AREAS.slice(0, 2).map((area, idx) => ({
      area,
      language: idx % 2 === 0 ? 'ar' : 'en',
      title: `Topic ${idx}`,
    }));
    assert.equal(pickArea(history), TOPIC_AREAS[2]);
  });

  it('keeps generated subjects advanced and Django/backend-specific', () => {
    assert.ok(TOPIC_AREAS.length >= 5);
    assert.ok(TOPIC_AREAS.every((area) => /Django/i.test(area)));

    const ideaPrompt = buildTopicIdeaPrompt({ area: TOPIC_AREAS[0], history: [] });
    assert.match(ideaPrompt, /senior-level/i);
    assert.match(ideaPrompt, /Do not invent a personal incident/i);

    const topic = topicFromTechnicalSeed('We solved a slow computer-vision pipeline in our project.');
    const postPrompt = buildTopicPostPrompt(topic);
    assert.equal(topic.isGeneral, true);
    assert.equal(topic.isCustomSource, true);
    assert.match(postPrompt, /NOT A VERIFIED PERSONAL ACCOUNT/);
    assert.match(postPrompt, /Django\/Python backend lens/);
    assert.match(postPrompt, /في أحد مشاريعنا/);
    assert.match(postPrompt, /stock AI phrases/);
  });

  it('detects duplicate or near-duplicate titles via token overlap', () => {
    const history = [
      { title: 'Why SELECT COUNT(*) gets slower as your table grows in Postgres' },
    ];
    assert.equal(
      isDuplicateTopic('Why SELECT COUNT(*) gets slower in large Postgres tables', history, 0.5),
      true
    );
    assert.equal(
      isDuplicateTopic('Redis eviction policies and cache stampede prevention', history, 0.5),
      false
    );
  });

  it('proposeTopic retries when model returns duplicate topic and succeeds on fresh topic', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-mode-test-'));
    const historyPath = path.join(tempDir, 'topic_history.json');

    try {
      saveTopicToHistory(
        {
          title: 'Why SELECT COUNT(*) gets slower in Postgres',
          slug: 'postgres-count-slow',
          area: TOPIC_AREAS[0],
          language: 'ar',
        },
        historyPath
      );

      let calls = 0;
      const topic = await proposeTopic({
        historyPath,
        generateText: async () => {
          calls += 1;
          if (calls === 1) {
            return JSON.stringify({
              title: 'Why SELECT COUNT(*) gets slower in Postgres',
              concept: 'MVCC visibility checks.',
              keywords: ['Postgres'],
              slug: 'postgres-count-slow',
            });
          }
          return JSON.stringify({
            title: 'How Outbox Pattern prevents dual-write inconsistency',
            concept: 'Writes domain state and event in the same database transaction.',
            keywords: ['Outbox', 'DistributedSystems', 'Postgres'],
            slug: 'outbox-pattern-dual-write',
          });
        },
      });

      assert.equal(calls, 2);
      assert.equal(topic.isGeneral, true);
      assert.equal(topic.language, 'en');
      assert.equal(topic.area, TOPIC_AREAS[1]);
      assert.equal(topic.slug, 'outbox-pattern-dual-write');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('buildContentPrompt delegates general topics to buildTopicPostPrompt with honesty rules', () => {
    const prompt = buildContentPrompt({
      title: 'Idempotency Keys in Payment APIs',
      concept: 'Preventing duplicate charges on network retries.',
      keywords: ['Idempotency', 'API', 'Backend'],
      language: 'en',
      isGeneral: true,
    });

    assert.match(prompt, /HONESTY RULES/);
    assert.match(prompt, /Do NOT claim.*personal production experience/);
    assert.match(prompt, /Idempotency Keys in Payment APIs/);
  });

  it('runRAGStaging uses general topic mode when query and situation are empty and saves history immediately', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-general-test-'));
    const draftsPath = path.join(tempDir, 'pending_drafts.json');
    const topicHistoryPath = path.join(tempDir, 'topic_history.json');

    try {
      let callCount = 0;
      const mockClient = {
        interactions: {
          create: async () => {
            callCount += 1;
            if (callCount === 1) {
              return {
                output_text: JSON.stringify({
                  title: 'Why Redis TTL jitter prevents thundering herds',
                  concept: 'Adding random jitter spreads cache expirations over time.',
                  keywords: ['Redis', 'Caching', 'Backend'],
                  slug: 'redis-ttl-jitter',
                }),
              };
            }
            return {
              output_text:
                'لماذا يسبب انتهاء صلاحية الكاش في نفس اللحظة انهيار قاعدة البيانات؟\n\n1. أضف jitter عشوائي للـ TTL.\n2. استخدم singleflight.\n\n#Redis #Backend #Caching',
            };
          },
        },
      };

      const result = await runRAGStaging({
        query: '',
        situation: '',
        draftId: 7,
        client: mockClient,
        draftsPath,
        topicHistoryPath,
        useBrandedCard: false,
      });

      assert.equal(result.success, true);
      assert.equal(result.draftId, 7);
      assert.equal(result.draft.topic, 'Why Redis TTL jitter prevents thundering herds');

      const history = loadTopicHistory(topicHistoryPath);
      assert.equal(history.length, 1);
      assert.equal(history[0].slug, 'redis-ttl-jitter');
      assert.equal(history[0].language, 'ar');

      const drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].id, 7);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('treats supplied situation text as a general Django/backend seed, not a claimed project incident', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-custom-seed-test-'));
    const draftsPath = path.join(tempDir, 'pending_drafts.json');
    const topicHistoryPath = path.join(tempDir, 'topic_history.json');
    let capturedPrompt = '';

    try {
      const mockClient = {
        interactions: {
          create: async ({ input }) => {
            capturedPrompt = input;
            return {
              output_text:
                'إبقاء طلب HTTP قصيرًا أهم من تنفيذ عمل بطيء داخل دورة حياة Django.\n\n' +
                'يمكن تمرير العمل إلى Celery بعد transaction.on_commit، ثم جعل المهمة idempotent لأن التسليم قد يتكرر.\n\n' +
                'اختيار queue منفصلة يحدّ من أثر الضغط على بقية الطلبات.\n\n' +
                'متى تنقلون المعالجة خارج مسار الطلب؟ #Django #Python #Backend #Celery',
            };
          },
        },
      };

      const result = await runRAGStaging({
        situation: 'We implemented a slow inference pipeline in one of our projects.',
        client: mockClient,
        draftsPath,
        topicHistoryPath,
        useBrandedCard: false,
      });

      assert.equal(result.success, true);
      assert.equal(result.draft.project, null);
      assert.equal(result.draft.situation, null);
      assert.equal(result.draft.topic, 'Advanced Django backend architecture');
      assert.match(capturedPrompt, /USER'S TECHNICAL SEED/);
      assert.match(capturedPrompt, /NOT A VERIFIED PERSONAL ACCOUNT/);
      assert.match(capturedPrompt, /Django\/Python backend lens/);
      assert.match(capturedPrompt, /We implemented a slow inference pipeline/);
      assert.equal(loadTopicHistory(topicHistoryPath).length, 1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('drops a local project image when branded-card rendering fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-image-fallback-test-'));
    const draftsPath = path.join(tempDir, 'pending_drafts.json');
    const oldProjectImage = path.join(tempDir, 'old-project.png');
    fs.writeFileSync(oldProjectImage, Buffer.from('old project image'));

    try {
      const result = await runRAGStaging({
        query: 'advanced Django ORM',
        draftsPath,
        assetsDir: tempDir,
        outputDir: path.join(tempDir, 'generated_images'),
        useBrandedCard: true,
        synthesizeRAGDraftFn: async () => ({
          project: '2wash',
          challenge: null,
          topic: {
            title: 'Django ORM query planning',
            slug: 'django-orm-query-planning',
            language: 'ar',
            keywords: ['Django', 'PostgreSQL'],
          },
          text: 'A general Django ORM explanation.',
          visualPath: oldProjectImage,
          visualSource: 'local',
          modelUsed: { text: 'test', visual: null },
          providerUsed: { text: 'test', visual: 'local' },
        }),
        generateCardContentFn: async () => ({
          title: 'Django ORM query planning',
          steps: ['Use QuerySet.explain()'],
          language: 'en',
        }),
        renderCardImageFn: async () => {
          throw new Error('Chromium screenshot timed out');
        },
      });

      assert.equal(result.success, true);
      assert.equal(result.draft.image_path, null);
      assert.equal(result.draft.visual_source, 'none');
      assert.match(result.imageError, /timed out/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
