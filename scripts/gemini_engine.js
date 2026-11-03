import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGroundedRAGPrompt,
  retrieveProjectContext,
  getNextChallenge,
} from './rag_engine.js';

export const DEFAULT_TEXT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_VISUAL_MODEL = 'gemini-nano-banana-2.1';
export const FALLBACK_VISUAL_MODEL = 'gemini-3-pro-image';

export const DEPRECATED_TEXT_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const DEPRECATED_VISUAL_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
];

export const DEFAULT_CF_TEXT_MODEL = '@cf/meta/llama-3.1-70b-instruct';
export const DEFAULT_CF_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * Checks if Cloudflare credentials are provided via options or environment variables.
 */
export function hasCloudflareCredentials(options = {}) {
  const accountId = options.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.cfApiToken || process.env.CLOUDFLARE_API_TOKEN;
  return Boolean(accountId && apiToken);
}

/**
 * Normalizes text model selection, rejecting deprecated models and defaulting to gemini-3.8-flash.
 */
export function normalizeTextModel(model) {
  if (!model) return DEFAULT_TEXT_MODEL;
  if (/^gemini-(1\.5|2\.0|2\.5)/i.test(model)) {
    console.warn(`[Warning] Model '${model}' is deprecated. Substituting with '${DEFAULT_TEXT_MODEL}'.`);
    return DEFAULT_TEXT_MODEL;
  }
  return model;
}

/**
 * Normalizes visual model selection, substituting deprecated visual models with gemini-nano-banana-2.1.
 */
export function normalizeVisualModel(model) {
  if (!model) return DEFAULT_VISUAL_MODEL;
  if (/^gemini-(1\.5|2\.0|2\.5|3\.1-flash-image)/i.test(model)) {
    console.warn(`[Warning] Visual model '${model}' is deprecated. Substituting with '${DEFAULT_VISUAL_MODEL}'.`);
    return DEFAULT_VISUAL_MODEL;
  }
  return model;
}

/**
 * Factory for creating the official @google/genai client.
 * Dynamically imports @google/genai so offline tests with mock clients do not require the package.
 */
export async function createGeminiClient({ apiKey = process.env.GEMINI_API_KEY } = {}) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required to initialize GoogleGenAI client');
  }
  try {
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    throw new Error(
      `Failed to initialize GoogleGenAI: ${err.message}. Ensure '@google/genai' is installed.`
    );
  }
}

/**
 * Builds the LinkedIn prompt strictly enforcing the 5-element breakdown for hiring managers.
 */
export function buildContentPrompt(topic) {
  if (topic?.ragContext) {
    return buildGroundedRAGPrompt(topic.ragContext);
  }

  const isEnglish = topic?.language === 'en';
  const languageDirective = isEnglish
    ? 'Language: English. Write in authoritative, crisp, professional engineering English.'
    : `Language: Professional Arabic enriched with standard English technical terms. English technical terms are allowed ONLY for established technical names, APIs, operators, framework names, metrics, and hashtags (for example: PostgreSQL, PostGIS, GiST index, ST_DWithin, Redis, Django, P95 latency, Race Condition, Idempotency).
Do not insert random English words or any other language. Never output words such as "enabled", "problem", "cause", or "solution" inside Arabic sentences. Do NOT translate or transliterate established technical names. Do not use Chinese or machine-translated fragments.`;

  const hookExample = isEnglish
    ? 'A database transaction is not a lock.'
    : 'استخدام DB::transaction وحده لا يحمي تطبيقك من الـ Race Conditions إذا لم تقفل السجلات أثناء القراءة.';
  const ruleExample = isEnglish
    ? 'Engineering rule: protect correctness at the database boundary, not only in the UI.'
    : 'الدرس الهندسي: لا تعتمد على حماية الواجهة لمنع تكرار العمليات الحساسة، وقاعدة البيانات هي خط الدفاع الحقيقي الوحيد.';
  const ctaLine = isEnglish ? 'Share your approach in the comments.' : 'اكتبوا لنا في التعليقات 👇';
  const rootCauseExample = isEnglish ? 'state the root cause clearly' : 'اذكر السبب الجذري بوضوح';
  const qualityCheck = isEnglish ? 'the English is coherent' : 'the Arabic is coherent';

  return `You are a Principal Software Architect writing a high-signal technical post for LinkedIn aimed at engineering leaders, CTOs, and hiring managers.

Topic Details:
- Title: ${topic?.title || topic?.slug || 'Architecture Deep-Dive'}
- Concept: ${topic?.concept || topic?.title || 'System Design Mechanics'}
- Keywords: ${(topic?.keywords || []).join(', ') || 'System Design, Architecture'}
- ${languageDirective}

Post Requirements:
You MUST structure your post into a seamless, high-signal LinkedIn engineering narrative with double line-breaks between short paragraphs.
CRITICAL FORMATTING RULE: Absolutely NEVER output section numbers, brackets, markdown headers or labels like "[1. The Hook]" or "### Root Cause". The output must read like a senior software architect genuinely sharing a real production incident.

Follow this natural narrative structure:

1. [The Hook - Architectural Dilemma]:
Start immediately on line 1 with a bold, punchy, counter-intuitive architectural dilemma or technical statement (e.g., "${hookExample}"). Avoid generic introductions. Hook the reader immediately with an engineering dilemma.

2. [Deep-Dive - Technical Mechanics & Incident]:
Describe the real production context, the subtle failure mode or race condition that emerged under high concurrency or throughput, the initial hypothesis, and how you wrote an automated test to isolate and prove the issue. Explain the "how" and "why" under the hood with technical depth and ${rootCauseExample}.

3. [Actionable Concrete Solution]:
Present the direct solution in 2 numbered steps (1. and 2.) featuring exact framework/database mechanisms and code constructs.

4. [Key Takeaways - Engineering Rules]:
Provide a memorable, battle-tested engineering rule of thumb (e.g. "${ruleExample}").

5. [Call to Action - Peer Question]:
An engaging technical question directed at fellow software architects and senior engineers to foster discussion in the comments, followed immediately by:
"${ctaLine}"

6. [Hashtags]:
4 to 6 relevant technical hashtags as plain space-separated text (e.g., #SystemDesign #SoftwareArchitecture #Backend #DistributedSystems). Do NOT use Markdown links.

  Maintain an authoritative, insightful tone. Do not use corporate fluff or clickbait. Use only facts in Topic Details; do not invent metrics or outcomes. Before finalizing, silently check that ${qualityCheck}, the post is complete, and no random foreign-language fragments remain. Deliver maximum engineering signal.`;
}

const HASHTAG_ALIASES = new Map([
  ['postgis', '#PostGIS'],
  ['postgresql', '#PostgreSQL'],
  ['postgres', '#PostgreSQL'],
  ['gist', '#GiST'],
  ['spatial-indexing', '#SpatialIndexing'],
  ['geospatial', '#Geospatial'],
  ['django-rest', '#Django'],
  ['django', '#Django'],
  ['redis', '#Redis'],
  ['celery', '#Celery'],
  ['kafka', '#Kafka'],
  ['graphql', '#GraphQL'],
  ['system-design', '#SystemDesign'],
  ['distributed-systems', '#DistributedSystems'],
  ['software-architecture', '#SoftwareArchitecture'],
  ['backend', '#Backend'],
  ['database', '#Database'],
  ['database-design', '#DatabaseDesign'],
  ['machine-learning', '#MachineLearning'],
  ['api', '#API'],
]);

/**
 * Guarantees every generated post ends with 4–6 relevant LinkedIn hashtags.
 * Models are instructed to provide hashtags, but this deterministic guard also
 * covers truncated or low-quality responses from either text provider.
 */
export function ensureHashtags(text, topic = {}) {
  const source = String(text || '').trim();
  const existing = source.match(/#[\p{L}\p{N}_-]+/gu) || [];
  const candidates = [];
  const add = (tag) => {
    if (!tag || candidates.includes(tag)) return;
    candidates.push(tag);
  };

  existing.forEach(add);
  const topicTerms = [
    ...(Array.isArray(topic?.keywords) ? topic.keywords : []),
    topic?.slug,
    topic?.title,
    topic?.concept,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const [term, tag] of HASHTAG_ALIASES) {
    if (topicTerms.includes(term)) add(tag);
    if (candidates.length >= 6) break;
  }

  ['#SoftwareEngineering', '#SystemDesign', '#Backend', '#Technology']
    .forEach(add);

  const hashtags = candidates.slice(0, 6);
  const withoutInlineTags = source
    .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return `${withoutInlineTags}\n\n${hashtags.slice(0, 4).length >= 4 ? hashtags.join(' ') : '#SoftwareEngineering #SystemDesign #Backend #Technology'}`;
}

/**
 * Builds a prompt for visual generation fallback via Gemini Nano Banana 2.1 / Pro Image.
 */
export function buildVisualPrompt(topic) {
  const title = topic?.title || topic?.slug || 'System Architecture';
  const concept = topic?.concept ? ` - ${topic.concept}` : '';
  const keywords = topic?.keywords?.length ? ` (Keywords: ${topic.keywords.join(', ')})` : '';

  return `A clean, modern, high-resolution conceptual technical architecture diagram illustrating ${title}${concept}${keywords}. Professional blueprint and system design aesthetic, clear system components, directional data flow arrows, dark mode tech palette with cyan and purple accents, high fidelity, sharp vector style suitable for senior software engineers on LinkedIn. No cluttered text, minimalist and high signal.`;
}

/**
 * Checks assets/<topic-slug>.* FIRST.
 * Returns the matching local asset path if found, or null if no local asset exists.
 */
export function resolveVisualAsset(topicSlug, { assetsDir = 'assets' } = {}) {
  if (!topicSlug) return null;

  const resolvedDir = path.resolve(process.cwd(), assetsDir);
  if (!fs.existsSync(resolvedDir)) {
    return null;
  }

  const stat = fs.statSync(resolvedDir);
  if (!stat.isDirectory()) {
    return null;
  }

  const files = fs.readdirSync(resolvedDir);
  const targetSlug = String(topicSlug).trim().toLowerCase();

  const match = files.find((file) => {
    if (file === '.gitkeep') return false;
    const ext = path.extname(file);
    if (!ext) return false;
    const base = path.basename(file, ext).trim().toLowerCase();
    return base === targetSlug;
  });

  if (match) {
    return path.join(assetsDir, match);
  }

  return null;
}

/**
 * Calls Cloudflare Workers AI REST API using native fetch.
 */
export async function callCloudflareWorkersAI({
  model,
  body,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  fetchClient = globalThis.fetch,
} = {}) {
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  }
  if (!fetchClient || typeof fetchClient !== 'function') {
    throw new Error('fetchClient function is required to call Cloudflare Workers AI');
  }

  const url = `${CF_API_BASE}/${accountId}/ai/run/${model}`;
  const response = await fetchClient(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare Workers AI HTTP ${response.status}: ${errorText}`);
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates post text strictly adhering to 5 elements via Cloudflare Workers AI (Llama 3.1 70B).
 */
export async function generatePostContentCloudflare(topic, options = {}) {
  const explicitModel =
    options.cfTextModel ||
    options.cfModel ||
    (options.model && !options.model.startsWith('gemini') ? options.model : null);
  const model = explicitModel || process.env.CLOUDFLARE_TEXT_MODEL || DEFAULT_CF_TEXT_MODEL;

  const {
    accountId = options.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken = options.cfApiToken || process.env.CLOUDFLARE_API_TOKEN,
    fetchClient = options.fetchClient || globalThis.fetch,
  } = options;

  const prompt = buildContentPrompt(topic);
  const body = {
    messages: [
      {
        role: 'system',
        content: 'You are a Principal Software Architect writing a high-signal technical post for LinkedIn aimed at engineering leaders.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const data = await callCloudflareWorkersAI({
    model,
    body,
    accountId,
    apiToken,
    fetchClient,
  });

  const text =
    data?.result?.response ??
    data?.result?.choices?.[0]?.message?.content ??
    data?.result?.choices?.[0]?.text ??
    (typeof data?.result === 'string' ? data.result : null);

  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Cloudflare text generation returned empty content');
  }

  return {
    text: ensureHashtags(text, topic),
    model,
    provider: 'cloudflare',
  };
}

/**
 * Generates visual asset fallback via Cloudflare Workers AI (FLUX.1-schnell).
 */
export async function generateVisualAssetCloudflare(topic, options = {}) {
  const explicitModel =
    options.cfImageModel ||
    options.cfModel ||
    (options.model && !options.model.startsWith('gemini') ? options.model : null);
  const model = explicitModel || process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CF_IMAGE_MODEL;

  const {
    outputDir = 'data/generated_images',
    accountId = options.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken = options.cfApiToken || process.env.CLOUDFLARE_API_TOKEN,
    fetchClient = options.fetchClient || globalThis.fetch,
  } = options;

  const visualPrompt = buildVisualPrompt(topic);
  const body = { prompt: visualPrompt };

  const data = await callCloudflareWorkersAI({
    model,
    body,
    accountId,
    apiToken,
    fetchClient,
  });

  let imageBuffer = null;
  if (Buffer.isBuffer(data)) {
    imageBuffer = data;
  } else if (data?.result?.image) {
    imageBuffer = Buffer.from(data.result.image, 'base64');
  } else if (typeof data?.result === 'string') {
    imageBuffer = Buffer.from(data.result, 'base64');
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Cloudflare visual generation did not return valid image data');
  }

  const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const slug = topic?.slug || `generated-${Date.now()}`;
  const filename = `${slug}.png`;
  const relativeFilePath = path.join(outputDir, filename);
  const absoluteFilePath = path.join(resolvedOutputDir, filename);

  fs.writeFileSync(absoluteFilePath, imageBuffer);

  return {
    visualPath: relativeFilePath,
    visualSource: 'generated',
    model,
    provider: 'cloudflare',
  };
}

export async function withTimeout(promise, ms = 8000, errorMsg = 'Operation timed out') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${errorMsg} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates post text adhering to the 5-element breakdown using gemini-3.8-flash,
 * with automatic fallback to Cloudflare Workers AI if Gemini fails or is unavailable.
 */
export async function generatePostContent(topic, options = {}) {
  const {
    client = null,
    model = DEFAULT_TEXT_MODEL,
    fetchClient = globalThis.fetch,
    timeoutMs = 8000,
  } = options;

  const validModel = normalizeTextModel(model);
  const prompt = buildContentPrompt(topic);

  try {
    const geminiClient = client || await createGeminiClient();

    const interaction = await withTimeout(
      geminiClient.interactions.create({
        model: validModel,
        input: prompt,
      }),
      timeoutMs,
      'Gemini text generation timed out'
    );

    const text = interaction?.output_text ?? interaction?.text ?? (typeof interaction === 'string' ? interaction : '');
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Gemini text generation returned empty content');
    }

    return {
      text: ensureHashtags(text, topic),
      model: validModel,
      provider: 'gemini',
    };
  } catch (geminiError) {
    if (hasCloudflareCredentials(options)) {
      console.warn(`[Fallback] Gemini text generation failed (${geminiError.message}). Falling back to Cloudflare Workers AI.`);
      const { model: _ignored, ...restOptions } = options;
      return await generatePostContentCloudflare(topic, { ...restOptions, fetchClient });
    }
    throw geminiError;
  }
}

/**
 * Generates visual asset fallback using gemini-nano-banana-2.1,
 * with automatic fallback to Cloudflare Workers AI (FLUX.1-schnell) if Gemini fails.
 */
export async function generateVisualAsset(topic, options = {}) {
  const {
    client = null,
    model = DEFAULT_VISUAL_MODEL,
    outputDir = 'data/generated_images',
    fetchClient = globalThis.fetch,
    timeoutMs = 8000,
  } = options;

  const validModel = normalizeVisualModel(model);
  const visualPrompt = buildVisualPrompt(topic);

  try {
    const geminiClient = client || await createGeminiClient();

    const interaction = await withTimeout(
      geminiClient.interactions.create({
        model: validModel,
        input: visualPrompt,
      }),
      timeoutMs,
      'Gemini visual generation timed out'
    );

    let imageData = null;
    if (interaction?.output_image?.data) {
      imageData = interaction.output_image.data;
    } else if (interaction?.image?.data) {
      imageData = interaction.image.data;
    } else if (interaction?.data) {
      imageData = interaction.data;
    } else if (Buffer.isBuffer(interaction?.output_image)) {
      imageData = interaction.output_image;
    }

    if (!imageData) {
      throw new Error('Gemini visual generation did not return valid image data');
    }

    const buffer = Buffer.isBuffer(imageData)
      ? imageData
      : Buffer.from(imageData, 'base64');

    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
    if (!fs.existsSync(resolvedOutputDir)) {
      fs.mkdirSync(resolvedOutputDir, { recursive: true });
    }

    const slug = topic?.slug || `generated-${Date.now()}`;
    const filename = `${slug}.png`;
    const relativeFilePath = path.join(outputDir, filename);
    const absoluteFilePath = path.join(resolvedOutputDir, filename);

    fs.writeFileSync(absoluteFilePath, buffer);

    return {
      visualPath: relativeFilePath,
      visualSource: 'generated',
      model: validModel,
      provider: 'gemini',
    };
  } catch (geminiError) {
    if (hasCloudflareCredentials(options)) {
      console.warn(`[Fallback] Gemini visual generation failed (${geminiError.message}). Falling back to Cloudflare Workers AI.`);
      const { model: _ignored, ...restOptions } = options;
      return await generateVisualAssetCloudflare(topic, { ...restOptions, outputDir, fetchClient });
    }
    throw geminiError;
  }
}

/**
 * Orchestrates dual-visual synthesis and 5-element technical content generation.
 * Priority: checks assets/<topic-slug>.* FIRST. Only invokes visual generation if no local asset exists.
 * Automatically falls back to Cloudflare Workers AI if Gemini services are unavailable.
 */
export async function synthesizeDraft(topic, options = {}) {
  const {
    client = null,
    assetsDir = 'assets',
    outputDir = 'data/generated_images',
    textModel = DEFAULT_TEXT_MODEL,
    visualModel = DEFAULT_VISUAL_MODEL,
    fetchClient = globalThis.fetch,
  } = options;

  if (!topic) {
    throw new Error('Topic object is required for synthesis');
  }

  // 1. Dual-visual check: check local assets FIRST
  const localAsset = resolveVisualAsset(topic.slug, { assetsDir });
  // 2–3. Start visual and text generation together when both require a provider.
  // This removes one full network round-trip from projects without a local asset.
  const visualPromise = localAsset
    ? Promise.resolve({
      visualPath: localAsset,
      visualSource: 'local',
      model: null,
      provider: 'local',
    })
    : generateVisualAsset(topic, {
      ...options,
      client,
      model: visualModel,
      outputDir,
      fetchClient,
    });
  const textPromise = generatePostContent(topic, {
    ...options,
    client,
    model: textModel,
    fetchClient,
  });
  const [visualResult, textResult] = await Promise.all([visualPromise, textPromise]);

  return {
    topic,
    text: textResult.text,
    visualPath: visualResult.visualPath,
    visualSource: visualResult.visualSource,
    modelUsed: {
      text: textResult.model,
      visual: visualResult.model,
    },
    providerUsed: {
      text: textResult.provider || 'gemini',
      visual: visualResult.provider || (visualResult.visualSource === 'local' ? 'local' : 'gemini'),
    },
  };
}

/**
 * Synthesizes a LinkedIn draft grounded in Mahmoud's real projects and architectural challenges.
 * Retrieves facts and style via RAG, pairs with local project asset if available, and generates
 * high-signal 5-element breakdown post text.
 */
export async function synthesizeRAGDraft(options = {}) {
  const {
    query = '',
    situation = '',
    challenge: providedChallenge = null,
    client = null,
    assetsDir = 'assets',
    outputDir = 'data/generated_images',
    textModel = DEFAULT_TEXT_MODEL,
    visualModel = DEFAULT_VISUAL_MODEL,
    fetchClient = globalThis.fetch,
  } = options;

  let challenge = providedChallenge;
  let retrievedDocs = [];
  let matchedProject = null;

  const searchQuery = query || situation;

  if (searchQuery) {
    const ragResult = await retrieveProjectContext(searchQuery, {
      topK: 3,
      geminiClient: client,
    });
    challenge = ragResult.challenge;
    retrievedDocs = ragResult.retrievedDocs;
    matchedProject = ragResult.matchedProject;
  } else if (!challenge) {
    challenge = getNextChallenge();
    matchedProject = challenge.project;
    const ragResult = await retrieveProjectContext(`${challenge.project} ${challenge.title}`, {
      topK: 3,
      geminiClient: client,
    });
    retrievedDocs = ragResult.retrievedDocs;
  } else {
    matchedProject = challenge.project;
  }

  const projectSlug = challenge?.project || matchedProject || '2wash';
  const topicObj = {
    id: challenge?.id || Date.now(),
    slug: projectSlug,
    title: challenge?.title || (situation ? 'Production Incident Post-Mortem' : 'Architectural Case Study'),
    concept: challenge?.dilemma || challenge?.solution || situation || '',
    keywords: challenge?.keywords || ['SystemDesign', 'Backend'],
    language: 'ar',
    isRAG: true,
    challenge,
    situation,
    ragContext: {
      query,
      situation,
      challenge,
      retrievedDocs,
      isEnglish: false,
    },
  };

  // 1. Dual-visual check: check assets/<projectSlug>.* or assets/<topic.slug>.* FIRST
  let localAsset = resolveVisualAsset(projectSlug, { assetsDir });
  if (!localAsset && topicObj.slug !== projectSlug) {
    localAsset = resolveVisualAsset(topicObj.slug, { assetsDir });
  }

  let visualResult;
  if (localAsset) {
    visualResult = {
      visualPath: localAsset,
      visualSource: 'local',
      model: null,
      provider: 'local',
    };
  } else {
    visualResult = await generateVisualAsset(topicObj, {
      ...options,
      client,
      model: visualModel,
      outputDir,
      fetchClient,
    });
  }

  // 2–3. Generate text and a remote visual concurrently when no local asset exists.
  const visualPromise = localAsset
    ? Promise.resolve(visualResult)
    : generateVisualAsset(topicObj, {
      ...options,
      client,
      model: visualModel,
      outputDir,
      fetchClient,
    });
  const textPromise = generatePostContent(topicObj, {
    ...options,
    client,
    model: textModel,
    fetchClient,
  });
  const [resolvedVisualResult, textResult] = await Promise.all([visualPromise, textPromise]);

  return {
    project: challenge?.project_name || projectSlug,
    challenge,
    situation,
    topic: topicObj,
    text: textResult.text,
    visualPath: resolvedVisualResult.visualPath,
    visualSource: resolvedVisualResult.visualSource,
    modelUsed: {
      text: textResult.model,
      visual: resolvedVisualResult.model,
    },
    providerUsed: {
      text: textResult.provider || 'gemini',
      visual: resolvedVisualResult.provider || (resolvedVisualResult.visualSource === 'local' ? 'local' : 'gemini'),
    },
  };
}

// Aliases for compatibility
export const synthesizeContent = synthesizeDraft;
export const generateDualVisualContent = synthesizeDraft;

// CLI execution helper
if (process.argv[1]) {
  const currentPath = fileURLToPath(import.meta.url);
  const invokedPath = path.resolve(process.argv[1]);

  if (currentPath === invokedPath) {
    const rawArg = process.argv.slice(2).join(' ');
    let sampleTopic = {
      id: 1,
      slug: 'distributed-locking-redis',
      title: 'Distributed Locking with Redis (Redlock)',
      concept: 'Mutual exclusion in distributed architectures, clock drift edge cases, and split-brain safety',
      keywords: ['Distributed Systems', 'Redis', 'Redlock', 'System Design'],
      language: 'ar',
    };

    if (rawArg) {
      try {
        sampleTopic = JSON.parse(rawArg);
      } catch {
        const slugIndex = process.argv.indexOf('--slug');
        if (slugIndex !== -1 && process.argv[slugIndex + 1]) {
          sampleTopic.slug = process.argv[slugIndex + 1];
        }
      }
    }

    synthesizeDraft(sampleTopic)
      .then((res) => {
        console.log(JSON.stringify(res, null, 2));
      })
      .catch((err) => {
        console.error('Synthesis failed:', err.message);
        process.exit(1);
      });
  }
}
