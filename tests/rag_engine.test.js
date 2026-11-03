import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  normalizeArabic,
  tokenize,
  BM25Index,
  loadProjectChunks,
  loadChallengesMatrix,
  loadAuthorStyleGuide,
  loadRAGState,
  saveRAGState,
  getNextChallenge,
  cosineSimilarity,
  reciprocalRankFusion,
  retrieveProjectContext,
  buildGroundedRAGPrompt,
} from '../scripts/rag_engine.js';

import {
  synthesizeRAGDraft,
} from '../scripts/gemini_engine.js';

import {
  runRAGStaging,
} from '../scripts/generate_rag_draft.js';

describe('RAG Engine - Arabic Normalization & Tokenization', () => {
  it('strips Arabic diacritics (tashkeel)', () => {
    const raw = 'نِظَامُ البَحْثِ الهَجِينِ';
    const normalized = normalizeArabic(raw);
    assert.equal(normalized, 'نظام البحث الهجين');
  });

  it('folds alef variations to simple alef', () => {
    const raw = 'إرسال أحدث آليات الاسترجاع';
    const normalized = normalizeArabic(raw);
    assert.equal(normalized, 'ارسال احدث اليات الاسترجاع');
  });

  it('folds yaa and alef maqsura variations', () => {
    const raw = 'علي مستوي';
    const normalized = normalizeArabic(raw);
    assert.equal(normalized, 'علي مستوي');
  });

  it('folds taa marbuta to haa', () => {
    const raw = 'معمارية النظم الموزعة';
    const normalized = normalizeArabic(raw);
    assert.equal(normalized, 'معماريه النظم الموزعه');
  });

  it('converts Eastern Arabic numerals to standard ASCII digits', () => {
    const raw = 'زمن الاستجابة ١١.٤ ميلي ثانية مع ٥٠٠ حجز';
    const normalized = normalizeArabic(raw);
    assert.ok(normalized.includes('11.4'));
    assert.ok(normalized.includes('500'));
  });

  it('tokenizes bilingual Arabic and English technical phrases', () => {
    const raw = 'استخدام Redis Distributed Locks مع SELECT FOR UPDATE';
    const tokens = tokenize(raw);
    assert.ok(tokens.includes('redis'));
    assert.ok(tokens.includes('distributed'));
    assert.ok(tokens.includes('locks'));
    assert.ok(tokens.includes('select'));
    assert.ok(tokens.includes('update'));
    assert.ok(tokens.includes('استخدام'));
  });
});

describe('RAG Engine - BM25 In-Memory Index', () => {
  const sampleDocs = [
    { id: 'doc-1', text: 'PostGIS spatial indexing with GIST R-tree for sub-12ms radius search in 2Wash' },
    { id: 'doc-2', text: 'EduTracker multi-tenant school operations with row-level security and 64 entities' },
    { id: 'doc-3', text: 'clientMORE applied RAG hybrid search combining ChromaDB dense vectors and BM25 RRF' },
  ];

  it('indexes documents and calculates positive scores for matching keywords', () => {
    const index = new BM25Index(sampleDocs);
    const results = index.search('PostGIS radius 2Wash');
    assert.ok(results.length > 0);
    assert.equal(results[0].doc.id, 'doc-1');
  });

  it('accurately ranks documents based on term specificity', () => {
    const index = new BM25Index(sampleDocs);
    const results = index.search('multi-tenant EduTracker 64 entities');
    assert.ok(results.length > 0);
    assert.equal(results[0].doc.id, 'doc-2');
  });

  it('returns empty array when no query terms match', () => {
    const index = new BM25Index(sampleDocs);
    const results = index.search('completely unmatching query xyz123');
    assert.deepEqual(results, []);
  });
});

describe('RAG Engine - Knowledge Base Loading & Challenges Matrix', () => {
  it('loads project chunks from data/rag/knowledge_base/projects', () => {
    const chunks = loadProjectChunks();
    assert.ok(chunks.length > 0, 'Should load chunks from markdown project dossiers');
    const projects = new Set(chunks.map((c) => c.project));
    assert.ok(projects.has('2wash'), 'Should contain 2Wash project');
    assert.ok(projects.has('edutracker'), 'Should contain EduTracker project');
    assert.ok(projects.has('clientmore'), 'Should contain clientMORE project');
  });

  it('loads challenges matrix with at least 10 structured challenge cards', () => {
    const challenges = loadChallengesMatrix();
    assert.ok(challenges.length >= 10, 'Should contain at least 10 challenges');
    for (const c of challenges) {
      assert.ok(c.id, 'Challenge must have an id');
      assert.ok(c.project, 'Challenge must have a project');
      assert.ok(c.title, 'Challenge must have a title');
      assert.ok(c.dilemma, 'Challenge must have a dilemma');
      assert.ok(c.solution, 'Challenge must have a solution');
      assert.ok(c.tradeoff, 'Challenge must have a tradeoff');
    }
  });

  it('loads author style guide successfully', () => {
    const styleGuide = loadAuthorStyleGuide();
    assert.ok(styleGuide.length > 100);
    assert.match(styleGuide, /محمود/);
    assert.match(styleGuide, /The Hook/i);
    assert.match(styleGuide, /Trade-Off/i);
  });
});

describe('RAG Engine - Sequential Challenge Cycling', () => {
  let tempDir;
  let testStatePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-cycle-test-'));
    testStatePath = path.join(tempDir, 'test_rag_state.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('cycles through challenges sequentially without skipping', () => {
    const challenges = loadChallengesMatrix();
    assert.ok(challenges.length >= 3);

    const first = getNextChallenge({ statePath: testStatePath });
    assert.equal(first.id, challenges[0].id);

    const second = getNextChallenge({ statePath: testStatePath });
    assert.equal(second.id, challenges[1].id);

    const third = getNextChallenge({ statePath: testStatePath });
    assert.equal(third.id, challenges[2].id);
  });

  it('wraps around to the first challenge and increments cycleCount when reaching the end', () => {
    const challenges = loadChallengesMatrix();
    const lastChallenge = challenges[challenges.length - 1];

    saveRAGState({ lastChallengeId: lastChallenge.id, cycleCount: 1 }, testStatePath);

    const next = getNextChallenge({ statePath: testStatePath });
    assert.equal(next.id, challenges[0].id);

    const state = loadRAGState(testStatePath);
    assert.equal(state.cycleCount, 2);
  });
});

describe('RAG Engine - Hybrid Retrieval & Rank Fusion', () => {
  it('correctly calculates cosine similarity', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    assert.equal(cosineSimilarity(vecA, vecB), 1.0);
    assert.equal(cosineSimilarity(vecA, vecC), 0.0);
  });

  it('fuses dense and lexical rankings with Reciprocal Rank Fusion', () => {
    const lexicalHits = [
      { doc: { id: 'doc-a', title: 'Doc A' }, score: 5.0 },
      { doc: { id: 'doc-b', title: 'Doc B' }, score: 3.0 },
    ];
    const denseHits = [
      { doc: { id: 'doc-b', title: 'Doc B' }, score: 0.95 },
      { doc: { id: 'doc-c', title: 'Doc C' }, score: 0.85 },
    ];

    const fused = reciprocalRankFusion(lexicalHits, denseHits, { rrfK: 60, topK: 3 });
    assert.equal(fused.length, 3);
    // doc-b appeared in both lists, so its fused score should be highest
    assert.equal(fused[0].doc.id, 'doc-b');
  });

  it('retrieves 2Wash context when queried for spatial indexing', async () => {
    const result = await retrieveProjectContext('PostGIS spatial radius lookup');
    assert.equal(result.matchedProject, '2wash');
    assert.ok(result.challenge);
    assert.match(result.challenge.title, /PostGIS|Spatial/i);
    assert.ok(result.retrievedDocs.length > 0);
  });

  it('retrieves EduTracker context when queried for multi-tenancy', async () => {
    const result = await retrieveProjectContext('multi-tenant school isolation');
    assert.equal(result.matchedProject, 'edutracker');
    assert.ok(result.challenge);
    assert.match(result.challenge.title, /Multi-Tenancy|Subdomain/i);
  });

  it('retrieves clientMORE context when queried for hybrid search', async () => {
    const result = await retrieveProjectContext('ChromaDB hybrid search BM25 RRF');
    assert.equal(result.matchedProject, 'clientmore');
    assert.ok(result.challenge);
    assert.match(result.challenge.title, /Hybrid Search|Normalization|RRF/i);
  });
});

describe('RAG Engine - Grounded Prompt Construction', () => {
  it('constructs grounded prompt embedding real metrics and author persona', () => {
    const challenge = {
      project: '2wash',
      project_name: '2Wash',
      title: 'PostGIS Spatial Indexing vs In-Memory Haversine',
      dilemma: 'How to query partner service center polygons across Riyadh & Jeddah under high concurrency.',
      solution: 'PostgreSQL PostGIS with GIST R-tree spatial indexing and ST_DWithin queries.',
      metrics: 'P95 < 12ms',
      tradeoff: 'PostGIS ST_DWithin + GIST Index vs In-memory Haversine filtering',
    };

    const retrievedDocs = [
      { title: '2Wash Architecture', text: 'Django REST + PostGIS spatial routing.' },
    ];

    const prompt = buildGroundedRAGPrompt({
      query: '2wash spatial',
      challenge,
      retrievedDocs,
    });

    assert.match(prompt, /محمود هشام المدلل/);
    assert.match(prompt, /Washer/);
    assert.match(prompt, /2Wash/);
    assert.match(prompt, /P95 < 12ms/);
    assert.match(prompt, /The Hook/i);
    assert.match(prompt, /Trade-Off/i);
    assert.match(prompt, /Key Takeaways/i);
    assert.match(prompt, /PostGIS ST_DWithin/i);
  });
});

describe('RAG Engine - End-to-End Synthesis & Staging Integration', () => {
  it('synthesizeRAGDraft resolves local project asset and generates grounded post', async () => {
    const mockClient = {
      interactions: {
        create: async (params) => ({
          output_text: `💡 معضلة معمارية في 2Wash\n\nنص التجربة الإنتاجية مع PostGIS.\n\n#SystemDesign #Backend`,
        }),
      },
    };

    const draft = await synthesizeRAGDraft({
      query: '2wash spatial lookup',
      client: mockClient,
      assetsDir: 'assets',
    });

    assert.equal(draft.project, '2Wash');
    assert.equal(draft.visualSource, 'local');
    assert.match(draft.visualPath, /2wash\.webp/);
    assert.ok(draft.text.includes('2Wash'));
    assert.equal(draft.providerUsed.text, 'gemini');
  });

  it('runRAGStaging creates draft and persists to pending_drafts.json with correct ID', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-staging-test-'));
    const testDraftsPath = path.join(tempDir, 'pending_drafts.json');

    try {
      const mockClient = {
        interactions: {
          create: async (params) => ({
            output_text: `💡 معضلة معمارية في EduTracker\n\nعزل المدارس عبر 64 كيان علائقي.\n\n#SystemDesign`,
          }),
        },
      };

      const result = await runRAGStaging({
        query: 'edutracker multi-tenancy',
        draftId: 10,
        client: mockClient,
        draftsPath: testDraftsPath,
        assetsDir: 'assets',
      });

      assert.equal(result.success, true);
      assert.equal(result.draftId, 10);
      assert.ok(fs.existsSync(testDraftsPath));

      const saved = JSON.parse(fs.readFileSync(testDraftsPath, 'utf8'));
      assert.equal(saved.length, 1);
      assert.equal(saved[0].id, 10);
      assert.ok(saved[0].project);
      assert.ok(saved[0].text);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
