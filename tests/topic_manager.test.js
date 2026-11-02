import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_DATA_PATH,
  loadTopics,
  saveTopics,
  getNextTopic,
  markTopicPublished,
  loadPendingDrafts,
  savePendingDrafts,
  getNextDraftId,
  resolveVisualAsset,
  stageDraft,
  addPendingDraft,
  getDraftById,
  getLatestDraft,
  removeDraft,
  approveDraft,
  rejectDraft
} from '../scripts/topic_manager.js';

const execFileAsync = promisify(execFile);

describe('Curated Topic Pool (config/post_topics.json)', () => {
  it('contains at least 15 comprehensive technical topics', async () => {
    const topics = await loadTopics(DEFAULT_CONFIG_PATH);
    assert.ok(Array.isArray(topics), 'Topics should be an array');
    assert.ok(topics.length >= 15, `Expected >= 15 topics, got ${topics.length}`);
  });

  it('validates each topic schema structure and constraints', async () => {
    const topics = await loadTopics(DEFAULT_CONFIG_PATH);
    const seenIds = new Set();
    const seenSlugs = new Set();

    let arCount = 0;
    let enCount = 0;

    for (const topic of topics) {
      assert.ok(Number.isInteger(topic.id), `Topic id must be an integer: ${JSON.stringify(topic)}`);
      assert.ok(!seenIds.has(topic.id), `Duplicate topic id found: ${topic.id}`);
      seenIds.add(topic.id);

      assert.ok(typeof topic.slug === 'string' && topic.slug.length > 0, `Topic slug required: ${topic.id}`);
      assert.ok(!seenSlugs.has(topic.slug), `Duplicate topic slug found: ${topic.slug}`);
      seenSlugs.add(topic.slug);

      assert.ok(typeof topic.title === 'string' && topic.title.length > 0, `Topic title required: ${topic.slug}`);
      assert.ok(typeof topic.concept === 'string' && topic.concept.length > 20, `Topic concept must be substantial: ${topic.slug}`);
      assert.ok(Array.isArray(topic.keywords) && topic.keywords.length >= 3, `Topic must have at least 3 keywords: ${topic.slug}`);

      assert.ok(['ar', 'en'].includes(topic.language), `Language must be 'ar' or 'en': ${topic.language}`);
      if (topic.language === 'ar') arCount++;
      if (topic.language === 'en') enCount++;

      assert.equal(topic.status, 'pending', `Initial topic status must be 'pending': ${topic.slug}`);
      assert.equal(topic.published_at, null, `Initial published_at must be null: ${topic.slug}`);
    }

    assert.ok(arCount > 0, 'Should include topics with Arabic language ("ar") by default');
    assert.ok(enCount > 0, 'Should include topics with English language ("en") for international targeting');
  });
});

describe('Pending Draft Storage (data/pending_drafts.json)', () => {
  it('initializes as a valid JSON array', async () => {
    const drafts = await loadPendingDrafts(DEFAULT_DATA_PATH);
    assert.ok(Array.isArray(drafts), 'Pending drafts must be an array');
  });
});

describe('Draft ID Calculation and Multi-Draft Queue', () => {
  let tmpDir;
  let testConfigPath;
  let testDataPath;
  let testAssetsDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'topic-mgr-test-'));
    testConfigPath = path.join(tmpDir, 'post_topics.json');
    testDataPath = path.join(tmpDir, 'pending_drafts.json');
    testAssetsDir = path.join(tmpDir, 'assets');

    await fs.mkdir(testAssetsDir, { recursive: true });

    const sampleTopics = [
      {
        id: 1,
        slug: 'distributed-idempotency',
        title: 'Distributed Idempotency Keys',
        concept: 'Atomic conditional writes in distributed databases.',
        keywords: ['distributed', 'idempotency'],
        language: 'ar',
        status: 'pending',
        published_at: null
      },
      {
        id: 2,
        slug: 'saga-orchestration',
        title: 'Saga Pattern in Distributed Systems',
        concept: 'Compensating transactions in microservice workflows.',
        keywords: ['saga', 'microservices'],
        language: 'ar',
        status: 'pending',
        published_at: null
      },
      {
        id: 3,
        slug: 'cache-stampede',
        title: 'Cache Stampede Mitigation',
        concept: 'XFetch and probabilistic early expiration.',
        keywords: ['caching', 'redis'],
        language: 'en',
        status: 'pending',
        published_at: null
      }
    ];

    await fs.writeFile(testConfigPath, JSON.stringify(sampleTopics, null, 2), 'utf8');
    await fs.writeFile(testDataPath, '[]', 'utf8');
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('calculates strictly incrementing numeric Draft IDs', () => {
    assert.equal(getNextDraftId([]), 1);
    assert.equal(getNextDraftId([{ id: 1 }]), 2);
    assert.equal(getNextDraftId([{ id: 1 }, { id: 2 }]), 3);
    assert.equal(getNextDraftId([{ id: 2 }, { id: 5 }]), 6);
  });

  it('stages multiple drafts sequentially without clobbering unreviewed drafts', async () => {
    const draft1 = await stageDraft(null, {
      configPath: testConfigPath,
      dataPath: testDataPath,
      assetsDir: testAssetsDir
    });
    assert.equal(draft1.id, 1);
    assert.equal(draft1.draft_id, 1);
    assert.equal(draft1.topic_slug, 'distributed-idempotency');

    const draft2 = await stageDraft(null, {
      configPath: testConfigPath,
      dataPath: testDataPath,
      assetsDir: testAssetsDir
    });
    assert.equal(draft2.id, 2);
    assert.equal(draft2.draft_id, 2);

    const draftsOnDisk = await loadPendingDrafts(testDataPath);
    assert.equal(draftsOnDisk.length, 2, 'Queue must hold both drafts without overwriting');
    assert.equal(draftsOnDisk[0].id, 1);
    assert.equal(draftsOnDisk[1].id, 2);
  });

  it('supports out-of-order approval and preserves remaining drafts', async () => {
    await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });
    await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });
    await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });

    let drafts = await loadPendingDrafts(testDataPath);
    assert.equal(drafts.length, 3);

    // Approve draft 2 specifically (out-of-order)
    const approved = await approveDraft(2, { dataPath: testDataPath, configPath: testConfigPath });
    assert.equal(approved.id, 2);

    drafts = await loadPendingDrafts(testDataPath);
    assert.equal(drafts.length, 2);
    assert.deepEqual(drafts.map((d) => d.id), [1, 3]);

    // Next staged draft must still get strictly incrementing ID (max(1, 3) + 1 = 4)
    const draft4 = await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });
    assert.equal(draft4.id, 4);
  });

  it('defaults plain /approve (no ID) to the latest draft', async () => {
    await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });
    await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });

    const approved = await approveDraft(null, { dataPath: testDataPath, configPath: testConfigPath });
    assert.equal(approved.id, 2, 'Plain approve should target the latest draft');

    const remaining = await loadPendingDrafts(testDataPath);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 1);
  });

  it('rejects draft and removes it without marking topic as published', async () => {
    const draft = await stageDraft(null, { configPath: testConfigPath, dataPath: testDataPath, assetsDir: testAssetsDir });
    assert.equal(draft.id, 1);

    const rejected = await rejectDraft(1, { dataPath: testDataPath });
    assert.equal(rejected.id, 1);

    const remaining = await loadPendingDrafts(testDataPath);
    assert.equal(remaining.length, 0);

    // Topic should still be pending
    const topics = await loadTopics(testConfigPath);
    assert.equal(topics[0].status, 'pending');
    assert.equal(topics[0].published_at, null);
  });

  it('cycles topics sequentially and resets on full completion', async () => {
    const topic1 = await getNextTopic({ configPath: testConfigPath });
    assert.equal(topic1.id, 1);
    await markTopicPublished(1, testConfigPath);

    const topic2 = await getNextTopic({ configPath: testConfigPath });
    assert.equal(topic2.id, 2);
    await markTopicPublished(2, testConfigPath);

    const topic3 = await getNextTopic({ configPath: testConfigPath });
    assert.equal(topic3.id, 3);
    await markTopicPublished(3, testConfigPath);

    // All published: next call cycles back to beginning
    const recycledTopic = await getNextTopic({ configPath: testConfigPath, autoCycle: true });
    assert.equal(recycledTopic.id, 1, 'Should reset and cycle back to first topic');
  });

  it('implements dual visual asset routing: local asset takes precedence over AI prompt', async () => {
    const topic = {
      id: 99,
      slug: 'sample-architecture',
      title: 'Sample Architecture Diagram',
      concept: 'High availability data layer',
      keywords: ['db', 'ha']
    };

    // 1. Without local file -> routes to ai_prompt
    const aiAsset = resolveVisualAsset(topic, testAssetsDir);
    assert.equal(aiAsset.type, 'ai_prompt');
    assert.equal(aiAsset.exists, false);
    assert.ok(aiAsset.prompt.includes('Sample Architecture Diagram'));

    // 2. With local file -> routes to local asset
    const localFilePath = path.join(testAssetsDir, 'sample-architecture.png');
    await fs.writeFile(localFilePath, 'fake-png-binary-data');

    const localAsset = resolveVisualAsset(topic, testAssetsDir);
    assert.equal(localAsset.type, 'local');
    assert.equal(localAsset.exists, true);
    assert.equal(localAsset.path, localFilePath);
    assert.equal(localAsset.filename, 'sample-architecture.png');
  });

  it('retrieves draft by ID and gets latest draft correctly', async () => {
    await addPendingDraft({ id: 1, title: 'Draft One' }, testDataPath);
    await addPendingDraft({ id: 2, title: 'Draft Two' }, testDataPath);

    const d1 = await getDraftById(1, testDataPath);
    assert.equal(d1.title, 'Draft One');

    const latest = await getLatestDraft(testDataPath);
    assert.equal(latest.id, 2);
    assert.equal(latest.title, 'Draft Two');

    const nonExistent = await getDraftById(999, testDataPath);
    assert.equal(nonExistent, null);
  });
});

describe('CLI Integration', () => {
  it('executes scripts/topic_manager.js --next and returns JSON topic', async () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'topic_manager.js');
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, '--next']);

    assert.equal(stderr, '');
    const topic = JSON.parse(stdout);
    assert.ok(topic.id != null, 'CLI output must include topic id');
    assert.ok(typeof topic.slug === 'string', 'CLI output must include topic slug');
    assert.ok(typeof topic.title === 'string', 'CLI output must include topic title');
    assert.ok(typeof topic.concept === 'string', 'CLI output must include topic concept');
    assert.equal(topic.status, 'pending');
  });
});
