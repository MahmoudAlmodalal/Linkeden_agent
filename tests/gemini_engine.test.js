import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DEFAULT_TEXT_MODEL,
  DEFAULT_VISUAL_MODEL,
  FALLBACK_VISUAL_MODEL,
  normalizeTextModel,
  normalizeVisualModel,
  buildContentPrompt,
  buildVisualPrompt,
  resolveVisualAsset,
  generatePostContent,
  generateVisualAsset,
  synthesizeDraft,
  createGeminiClient,
} from '../scripts/gemini_engine.js';

describe('Gemini Engine - Model Enforcement & Deprecation Rules', () => {
  it('defaults to gemini-3.8-flash for text generation', () => {
    assert.equal(DEFAULT_TEXT_MODEL, 'gemini-3.8-flash');
    assert.equal(normalizeTextModel(), 'gemini-3.8-flash');
    assert.equal(normalizeTextModel(null), 'gemini-3.8-flash');
  });

  it('rejects and substitutes deprecated text models with gemini-3.8-flash', () => {
    const deprecated = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ];

    for (const model of deprecated) {
      assert.equal(
        normalizeTextModel(model),
        'gemini-3.8-flash',
        `Expected ${model} to be normalized to gemini-3.8-flash`
      );
    }
  });

  it('preserves valid modern text models', () => {
    assert.equal(normalizeTextModel('gemini-3.8-flash'), 'gemini-3.8-flash');
    assert.equal(normalizeTextModel('gemini-4-argon'), 'gemini-4-argon');
  });

  it('defaults to gemini-nano-banana-2.1 for visual generation', () => {
    assert.equal(DEFAULT_VISUAL_MODEL, 'gemini-nano-banana-2.1');
    assert.equal(FALLBACK_VISUAL_MODEL, 'gemini-3-pro-image');
    assert.equal(normalizeVisualModel(), 'gemini-nano-banana-2.1');
  });

  it('substitutes deprecated visual models with gemini-nano-banana-2.1', () => {
    assert.equal(normalizeVisualModel('gemini-2.5-flash-image'), 'gemini-nano-banana-2.1');
    assert.equal(normalizeVisualModel('gemini-3.1-flash-image'), 'gemini-nano-banana-2.1');
  });

  it('preserves valid visual models', () => {
    assert.equal(normalizeVisualModel('gemini-nano-banana-2.1'), 'gemini-nano-banana-2.1');
    assert.equal(normalizeVisualModel('gemini-3-pro-image'), 'gemini-3-pro-image');
  });
});

describe('Gemini Engine - 5-Element Prompt Breakdown & Language Rules', () => {
  const sampleTopicAr = {
    id: 1,
    slug: 'distributed-locking-redis',
    title: 'Distributed Locking with Redis (Redlock)',
    concept: 'Mutual exclusion in distributed architectures, clock drift edge cases, and split-brain safety',
    keywords: ['Distributed Systems', 'Redis', 'Redlock', 'System Design'],
    language: 'ar',
  };

  const sampleTopicEn = {
    id: 2,
    slug: 'event-sourcing-cqrs',
    title: 'Event Sourcing and CQRS',
    concept: 'Separating read and write models with append-only event logs',
    keywords: ['CQRS', 'Event Sourcing', 'Kafka', 'DDD'],
    language: 'en',
  };

  it('strictly enforces all 5 elements in prompt structure', () => {
    const prompt = buildContentPrompt(sampleTopicAr);

    // 1. The Hook (architectural dilemma)
    assert.match(prompt, /Hook/i);
    assert.match(prompt, /Architectural Dilemma/i);

    // 2. Deep-dive (technical mechanics)
    assert.match(prompt, /Deep-Dive/i);
    assert.match(prompt, /Technical Mechanics/i);

    // 3. Key Takeaways (engineering rules)
    assert.match(prompt, /Key Takeaways/i);
    assert.match(prompt, /Engineering Rules/i);

    // 4. Call to Action (peer question)
    assert.match(prompt, /Call to Action/i);
    assert.match(prompt, /Peer Question/i);

    // 5. Hashtags
    assert.match(prompt, /Hashtags/i);
  });

  it('enforces professional Arabic with English technical terms by default or when language is ar', () => {
    const promptDefault = buildContentPrompt({ ...sampleTopicAr, language: undefined });
    assert.match(promptDefault, /Arabic/i);
    assert.match(promptDefault, /English technical terms/i);
    assert.match(promptDefault, /Do NOT translate or transliterate/i);

    const promptAr = buildContentPrompt(sampleTopicAr);
    assert.match(promptAr, /Arabic/i);
    assert.match(promptAr, /English technical terms/i);
  });

  it('enforces technical English when topic.language is en', () => {
    const promptEn = buildContentPrompt(sampleTopicEn);
    assert.match(promptEn, /Language: English/i);
    assert.doesNotMatch(promptEn, /Arabic/i);
  });

  it('constructs visual prompt with blueprint and architectural focus', () => {
    const visualPrompt = buildVisualPrompt(sampleTopicAr);
    assert.match(visualPrompt, /Distributed Locking with Redis/i);
    assert.match(visualPrompt, /diagram/i);
    assert.match(visualPrompt, /architecture/i);
  });
});

describe('Gemini Engine - Dual-Visual Asset Resolution', () => {
  let tempDir;
  let testAssetsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-assets-'));
    testAssetsDir = path.join(tempDir, 'assets');
    fs.mkdirSync(testAssetsDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns matching local asset path when file exists (e.g. .png)', () => {
    const filePath = path.join(testAssetsDir, 'distributed-locking-redis.png');
    fs.writeFileSync(filePath, 'fake-png-content');

    const resolved = resolveVisualAsset('distributed-locking-redis', { assetsDir: testAssetsDir });
    assert.equal(resolved, filePath);
  });

  it('supports various image extensions (.jpg, .jpeg, .svg, .webp)', () => {
    const extensions = ['.jpg', '.jpeg', '.svg', '.webp'];

    for (const ext of extensions) {
      const slug = `topic-with${ext.replace('.', '-')}`;
      const filePath = path.join(testAssetsDir, `${slug}${ext}`);
      fs.writeFileSync(filePath, 'fake-content');

      const resolved = resolveVisualAsset(slug, { assetsDir: testAssetsDir });
      assert.equal(resolved, filePath);
    }
  });

  it('ignores .gitkeep and non-matching files', () => {
    fs.writeFileSync(path.join(testAssetsDir, '.gitkeep'), '');
    fs.writeFileSync(path.join(testAssetsDir, 'other-topic.png'), 'fake');

    const resolved = resolveVisualAsset('unrelated-topic', { assetsDir: testAssetsDir });
    assert.equal(resolved, null);
  });

  it('returns null if assets directory does not exist', () => {
    const resolved = resolveVisualAsset('sample', { assetsDir: path.join(tempDir, 'non_existent_dir_12345') });
    assert.equal(resolved, null);
  });

  it('returns null if slug is empty or null', () => {
    assert.equal(resolveVisualAsset(null, { assetsDir: testAssetsDir }), null);
    assert.equal(resolveVisualAsset('', { assetsDir: testAssetsDir }), null);
  });
});

describe('Gemini Engine - Text & Visual Generation with Dependency Injection', () => {
  let tempDir;
  let testOutputDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-gen-'));
    testOutputDir = path.join(tempDir, 'generated_images');
    fs.mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generatePostContent invokes mock client with gemini-3.8-flash and returns generated text', async () => {
    const calls = [];
    const mockClient = {
      interactions: {
        create: async (params) => {
          calls.push(params);
          return {
            output_text: '1. The Hook: Concurrency chaos\n2. Deep-dive: Redlock algorithm\n3. Key Takeaways: TTL rules\n4. CTA: How do you handle GC?\n5. #SystemDesign #Redis',
          };
        },
      },
    };

    const topic = {
      slug: 'distributed-locking-redis',
      title: 'Distributed Locking with Redis',
      language: 'ar',
    };

    const result = await generatePostContent(topic, { client: mockClient });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gemini-3.8-flash');
    assert.match(calls[0].input, /Hook/i);
    assert.equal(result.model, 'gemini-3.8-flash');
    assert.match(result.text, /Redlock algorithm/i);
  });

  it('generatePostContent substitutes deprecated models with gemini-3.8-flash', async () => {
    const calls = [];
    const mockClient = {
      interactions: {
        create: async (params) => {
          calls.push(params);
          return { output_text: 'Generated text' };
        },
      },
    };

    await generatePostContent(
      { slug: 'test' },
      { client: mockClient, model: 'gemini-1.5-pro' }
    );

    assert.equal(calls[0].model, 'gemini-3.8-flash');
  });

  it('generateVisualAsset decodes base64 image and writes to output directory', async () => {
    const fakeImageBase64 = Buffer.from('fake-png-binary-data').toString('base64');
    const calls = [];

    const mockClient = {
      interactions: {
        create: async (params) => {
          calls.push(params);
          return {
            output_image: {
              data: fakeImageBase64,
              mime_type: 'image/png',
            },
          };
        },
      },
    };

    const topic = { slug: 'cqrs-kafka', title: 'CQRS with Kafka' };
    const result = await generateVisualAsset(topic, {
      client: mockClient,
      outputDir: testOutputDir,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gemini-nano-banana-2.1');
    assert.equal(result.visualSource, 'generated');
    assert.equal(result.model, 'gemini-nano-banana-2.1');

    const expectedFile = path.join(testOutputDir, 'cqrs-kafka.png');
    assert.ok(fs.existsSync(expectedFile), 'Generated image file should exist on disk');
    const content = fs.readFileSync(expectedFile);
    assert.equal(content.toString(), 'fake-png-binary-data');
  });

  it('generateVisualAsset throws descriptive error if output_image is missing', async () => {
    const mockClient = {
      interactions: {
        create: async () => ({ output_image: null }),
      },
    };

    await assert.rejects(
      async () => {
        await generateVisualAsset(
          { slug: 'fail-test' },
          { client: mockClient, outputDir: testOutputDir }
        );
      },
      /did not return valid image data/
    );
  });
});

describe('Gemini Engine - Dual-Visual Synthesis Priority Pipeline', () => {
  let tempDir;
  let testAssetsDir;
  let testOutputDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-dual-'));
    testAssetsDir = path.join(tempDir, 'assets');
    testOutputDir = path.join(tempDir, 'data/generated_images');
    fs.mkdirSync(testAssetsDir, { recursive: true });
    fs.mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('PRIORITY 1: Uses local asset if present and SKIPS visual generation', async () => {
    // 1. Create matching local asset
    const localAssetPath = path.join(testAssetsDir, 'distributed-locking-redis.png');
    fs.writeFileSync(localAssetPath, 'local-diagram-image-content');

    const calls = [];
    const mockClient = {
      interactions: {
        create: async (params) => {
          calls.push(params);
          return {
            output_text: 'Deep-dive content for distributed locking',
          };
        },
      },
    };

    const topic = {
      id: 1,
      slug: 'distributed-locking-redis',
      title: 'Distributed Locking with Redis (Redlock)',
      concept: 'Mutual exclusion in distributed architectures',
      language: 'ar',
    };

    const result = await synthesizeDraft(topic, {
      client: mockClient,
      assetsDir: testAssetsDir,
      outputDir: testOutputDir,
    });

    // Verify local visual source
    assert.equal(result.visualSource, 'local');
    assert.equal(result.visualPath, localAssetPath);
    assert.equal(result.modelUsed.visual, null);

    // Verify text was generated with gemini-3.8-flash
    assert.equal(result.modelUsed.text, 'gemini-3.8-flash');
    assert.equal(result.text, 'Deep-dive content for distributed locking');

    // Verify client was ONLY called once for text, NEVER for image!
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gemini-3.8-flash');
  });

  it('PRIORITY 2: Falls back to Gemini visual generation when no local asset exists', async () => {
    // Assets directory is empty
    const fakeImageBase64 = Buffer.from('generated-gemini-image').toString('base64');
    const calls = [];

    const mockClient = {
      interactions: {
        create: async (params) => {
          calls.push(params);
          if (params.model === 'gemini-nano-banana-2.1') {
            return {
              output_image: {
                data: fakeImageBase64,
                mime_type: 'image/png',
              },
            };
          }
          if (params.model === 'gemini-3.8-flash') {
            return {
              output_text: 'Technical breakdown text for Kafka partitioning',
            };
          }
          throw new Error(`Unexpected model call: ${params.model}`);
        },
      },
    };

    const topic = {
      id: 2,
      slug: 'kafka-partitioning-strategy',
      title: 'Kafka Partitioning Strategy',
      concept: 'High-throughput ordered streaming',
      language: 'en',
    };

    const result = await synthesizeDraft(topic, {
      client: mockClient,
      assetsDir: testAssetsDir,
      outputDir: testOutputDir,
    });

    // Verify visual source is generated
    assert.equal(result.visualSource, 'generated');
    assert.equal(result.modelUsed.visual, 'gemini-nano-banana-2.1');
    assert.equal(result.modelUsed.text, 'gemini-3.8-flash');

    // Verify file was written
    const expectedImagePath = path.join(testOutputDir, 'kafka-partitioning-strategy.png');
    assert.equal(result.visualPath, expectedImagePath);
    assert.ok(fs.existsSync(expectedImagePath));
    assert.equal(fs.readFileSync(expectedImagePath).toString(), 'generated-gemini-image');

    // Verify both visual and text were generated
    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, 'gemini-nano-banana-2.1');
    assert.equal(calls[1].model, 'gemini-3.8-flash');
  });
});

describe('Gemini Engine - Client Initialization Error Handling', () => {
  it('throws helpful error if createGeminiClient is called without apiKey', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await assert.rejects(
        async () => {
          await createGeminiClient();
        },
        /GEMINI_API_KEY is required/
      );
    } finally {
      if (originalKey) {
        process.env.GEMINI_API_KEY = originalKey;
      }
    }
  });
});
