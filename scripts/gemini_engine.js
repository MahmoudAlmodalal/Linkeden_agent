import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const isEnglish = topic?.language === 'en';
  const languageDirective = isEnglish
    ? 'Language: English. Write in authoritative, crisp, professional engineering English.'
    : `Language: Professional Arabic enriched with standard English technical terms.
Keep all core technical terminology in English (e.g. "Distributed Lock", "Event-Driven", "Cache Invalidation", "Throughput", "Latency", "Race Condition", "Idempotency", "ACID", "Split-Brain", "Deadlock", "Single Point of Failure", "Consensus Algorithm", "Message Queue"). Do NOT translate or transliterate these standard English technical concepts into awkward Arabic.`;

  return `You are a Principal Software Architect writing a high-signal technical post for LinkedIn aimed at engineering leaders, CTOs, and hiring managers.

Topic Details:
- Title: ${topic?.title || topic?.slug || 'Architecture Deep-Dive'}
- Concept: ${topic?.concept || topic?.title || 'System Design Mechanics'}
- Keywords: ${(topic?.keywords || []).join(', ') || 'System Design, Architecture'}
- ${languageDirective}

Post Requirements:
You MUST strictly structure your post into the following 5 distinct elements:

1. [The Hook - Architectural Dilemma]:
An attention-grabbing real-world architectural dilemma, production failure mode, or high-stakes trade-off that senior engineers and hiring managers immediately recognize. Avoid generic introductions. Hook the reader immediately with an engineering dilemma.

2. [Deep-Dive - Technical Mechanics]:
A detailed, rigorous breakdown of the internal technical mechanics, protocols, data structures, concurrency handling, or failure domains. Explain the "how" and "why" under the hood with technical depth.

3. [Key Takeaways - Engineering Rules]:
3 to 4 actionable, battle-tested engineering heuristics or rules of thumb formatted as bullet points for production systems.

4. [Call to Action - Peer Question]:
An engaging technical question directed at fellow software architects and senior engineers to foster discussion in the comments.

5. [Hashtags]:
4 to 6 relevant technical hashtags (e.g., #SystemDesign #SoftwareArchitecture #Backend #DistributedSystems).

Maintain an authoritative, insightful tone. Do not use corporate fluff or clickbait. Deliver maximum engineering signal.`;
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
 * Generates post text adhering to the 5-element breakdown using gemini-3.8-flash.
 */
export async function generatePostContent(topic, options = {}) {
  const {
    client = null,
    model = DEFAULT_TEXT_MODEL,
  } = options;

  const validModel = normalizeTextModel(model);
  const prompt = buildContentPrompt(topic);

  const geminiClient = client || await createGeminiClient();

  const interaction = await geminiClient.interactions.create({
    model: validModel,
    input: prompt,
  });

  const text = interaction?.output_text ?? interaction?.text ?? (typeof interaction === 'string' ? interaction : '');
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Gemini text generation returned empty content');
  }

  return {
    text: text.trim(),
    model: validModel,
  };
}

/**
 * Generates visual asset fallback using gemini-nano-banana-2.1 and writes to data/generated_images/.
 */
export async function generateVisualAsset(topic, options = {}) {
  const {
    client = null,
    model = DEFAULT_VISUAL_MODEL,
    outputDir = 'data/generated_images',
  } = options;

  const validModel = normalizeVisualModel(model);
  const visualPrompt = buildVisualPrompt(topic);

  const geminiClient = client || await createGeminiClient();

  const interaction = await geminiClient.interactions.create({
    model: validModel,
    input: visualPrompt,
  });

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
  };
}

/**
 * Orchestrates dual-visual synthesis and 5-element technical content generation.
 * Priority: checks assets/<topic-slug>.* FIRST. Only invokes Gemini visual generation if no local asset exists.
 */
export async function synthesizeDraft(topic, options = {}) {
  const {
    client = null,
    assetsDir = 'assets',
    outputDir = 'data/generated_images',
    textModel = DEFAULT_TEXT_MODEL,
    visualModel = DEFAULT_VISUAL_MODEL,
  } = options;

  if (!topic) {
    throw new Error('Topic object is required for synthesis');
  }

  // 1. Dual-visual check: check local assets FIRST
  const localAsset = resolveVisualAsset(topic.slug, { assetsDir });
  let visualResult;

  if (localAsset) {
    visualResult = {
      visualPath: localAsset,
      visualSource: 'local',
      model: null,
    };
  } else {
    // 2. Generate fallback visual via Gemini
    visualResult = await generateVisualAsset(topic, {
      client,
      model: visualModel,
      outputDir,
    });
  }

  // 3. Generate 5-element breakdown technical text via gemini-3.8-flash
  const textResult = await generatePostContent(topic, {
    client,
    model: textModel,
  });

  return {
    topic,
    text: textResult.text,
    visualPath: visualResult.visualPath,
    visualSource: visualResult.visualSource,
    modelUsed: {
      text: textResult.model,
      visual: visualResult.model,
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
