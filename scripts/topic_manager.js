import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Default configuration paths
export const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'post_topics.json');
export const DEFAULT_DATA_PATH = path.resolve(process.cwd(), 'data', 'pending_drafts.json');
export const DEFAULT_ASSETS_DIR = path.resolve(process.cwd(), 'assets');

const SUPPORTED_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

/**
 * Load topics from config/post_topics.json.
 * @param {string} configPath
 * @returns {Promise<Array>}
 */
export async function loadTopics(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const topics = JSON.parse(data);
    if (!Array.isArray(topics)) {
      throw new TypeError(`Expected topics file to contain an array, got ${typeof topics}`);
    }
    return topics;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Topics file not found at: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Save topics to config/post_topics.json.
 * @param {Array} topics
 * @param {string} configPath
 */
export async function saveTopics(topics, configPath = DEFAULT_CONFIG_PATH) {
  if (!Array.isArray(topics)) {
    throw new TypeError('Topics must be an array');
  }
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(topics, null, 2) + '\n', 'utf8');
}

/**
 * Get next pending topic in sequential non-repeating cycle.
 * If all topics are published, resets all topics to pending to start a new cycle.
 * @param {Object} options
 * @param {string} [options.configPath]
 * @param {boolean} [options.autoCycle=true]
 * @returns {Promise<Object>}
 */
export async function getNextTopic(options = {}) {
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const autoCycle = options.autoCycle !== false;
  const topics = await loadTopics(configPath);

  if (topics.length === 0) {
    throw new Error('No topics available in pool');
  }

  let nextTopic = topics.find((t) => t.status === 'pending');

  if (!nextTopic && autoCycle) {
    // Reset all topics to start a fresh non-repeating cycle
    for (const topic of topics) {
      topic.status = 'pending';
      topic.published_at = null;
    }
    await saveTopics(topics, configPath);
    nextTopic = topics[0];
  }

  if (!nextTopic) {
    throw new Error('All topics have been published and cycling is disabled');
  }

  return nextTopic;
}

/**
 * Mark a topic as published.
 * @param {number|string} topicId
 * @param {string} configPath
 * @returns {Promise<Object>}
 */
export async function markTopicPublished(topicId, configPath = DEFAULT_CONFIG_PATH) {
  const topics = await loadTopics(configPath);
  const numericId = Number(topicId);
  const topic = topics.find((t) => Number(t.id) === numericId);

  if (!topic) {
    throw new Error(`Topic with id ${topicId} not found`);
  }

  topic.status = 'published';
  topic.published_at = new Date().toISOString();
  await saveTopics(topics, configPath);
  return topic;
}

/**
 * Load pending drafts from data/pending_drafts.json.
 * Initializes file with empty array if it doesn't exist.
 * @param {string} dataPath
 * @returns {Promise<Array>}
 */
export async function loadPendingDrafts(dataPath = DEFAULT_DATA_PATH) {
  try {
    const content = await fs.readFile(dataPath, 'utf8');
    const drafts = JSON.parse(content);
    if (!Array.isArray(drafts)) {
      throw new TypeError(`Pending drafts file must contain an array, got ${typeof drafts}`);
    }
    return drafts;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      await fs.writeFile(dataPath, '[]\n', 'utf8');
      return [];
    }
    throw error;
  }
}

/**
 * Save pending drafts to data/pending_drafts.json.
 * @param {Array} drafts
 * @param {string} dataPath
 */
export async function savePendingDrafts(drafts, dataPath = DEFAULT_DATA_PATH) {
  if (!Array.isArray(drafts)) {
    throw new TypeError('Drafts must be an array');
  }
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(drafts, null, 2) + '\n', 'utf8');
}

/**
 * Calculate the next strictly incrementing numeric integer Draft ID.
 * @param {Array} drafts
 * @returns {number}
 */
export function getNextDraftId(drafts = []) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return 1;
  }
  const maxId = drafts.reduce((max, d) => {
    const idVal = Number(d.id ?? d.draft_id);
    return Number.isFinite(idVal) ? Math.max(max, idVal) : max;
  }, 0);
  return maxId + 1;
}

/**
 * Resolve visual asset for a topic: checks local assets/ or falls back to AI generation prompt.
 * @param {Object} topic
 * @param {string} [assetsDir]
 * @returns {Object}
 */
export function resolveVisualAsset(topic, assetsDir = DEFAULT_ASSETS_DIR) {
  if (!topic || !topic.slug) {
    throw new Error('Valid topic with slug is required to resolve visual asset');
  }

  for (const ext of SUPPORTED_ASSET_EXTENSIONS) {
    const candidatePath = path.resolve(assetsDir, `${topic.slug}${ext}`);
    if (existsSync(candidatePath)) {
      return {
        type: 'local',
        source: 'local',
        path: candidatePath,
        filename: `${topic.slug}${ext}`,
        exists: true
      };
    }
  }

  // Fallback to AI Prompt for Google Gemini Imagen
  const keywordsList = Array.isArray(topic.keywords) ? topic.keywords.join(', ') : '';
  const prompt = `Minimalist technical system architecture diagram illustrating "${topic.title}": ${topic.concept}. High-contrast engineering blueprint aesthetic, clean vectors, dark mode tech palette. Focus on core architectural data flow and system components. Keywords: ${keywordsList}.`;

  return {
    type: 'ai_prompt',
    source: 'ai_prompt',
    prompt,
    exists: false
  };
}

/**
 * Stage a pending draft into data/pending_drafts.json without clobbering existing drafts.
 * @param {Object} [topic] - Topic to stage (optional, defaults to next pending topic)
 * @param {Object} [options]
 * @param {string} [options.dataPath]
 * @param {string} [options.configPath]
 * @param {string} [options.assetsDir]
 * @param {string} [options.content]
 * @returns {Promise<Object>}
 */
export async function stageDraft(topic = null, options = {}) {
  const dataPath = options.dataPath || DEFAULT_DATA_PATH;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const assetsDir = options.assetsDir || DEFAULT_ASSETS_DIR;

  const targetTopic = topic || (await getNextTopic({ configPath }));
  const drafts = await loadPendingDrafts(dataPath);

  const draftId = getNextDraftId(drafts);
  const visualAsset = resolveVisualAsset(targetTopic, assetsDir);

  const newDraft = {
    id: draftId,
    draft_id: draftId,
    topic_id: targetTopic.id,
    topic_slug: targetTopic.slug,
    title: targetTopic.title,
    concept: targetTopic.concept,
    keywords: targetTopic.keywords || [],
    language: targetTopic.language || 'ar',
    content: options.content || null,
    visual_asset: visualAsset,
    status: 'pending_review',
    created_at: new Date().toISOString()
  };

  drafts.push(newDraft);
  await savePendingDrafts(drafts, dataPath);

  return newDraft;
}

/**
 * Add a draft object directly to data/pending_drafts.json.
 * @param {Object} draftData
 * @param {string} dataPath
 * @returns {Promise<Object>}
 */
export async function addPendingDraft(draftData, dataPath = DEFAULT_DATA_PATH) {
  if (!draftData || typeof draftData !== 'object') {
    throw new TypeError('draftData must be an object');
  }

  const drafts = await loadPendingDrafts(dataPath);
  const draftId = draftData.id != null ? Number(draftData.id) : getNextDraftId(drafts);

  if (!Number.isInteger(draftId) || draftId < 1) {
    throw new Error(`Draft ID must be a strictly incrementing numeric integer (1, 2, 3...), got ${draftData.id}`);
  }

  const newDraft = {
    ...draftData,
    id: draftId,
    draft_id: draftId,
    status: draftData.status || 'pending_review',
    created_at: draftData.created_at || new Date().toISOString()
  };

  drafts.push(newDraft);
  await savePendingDrafts(drafts, dataPath);
  return newDraft;
}

/**
 * Retrieve a pending draft by Draft ID.
 * @param {number|string} id
 * @param {string} dataPath
 * @returns {Promise<Object|null>}
 */
export async function getDraftById(id, dataPath = DEFAULT_DATA_PATH) {
  const drafts = await loadPendingDrafts(dataPath);
  const numericId = Number(id);
  return drafts.find((d) => Number(d.id ?? d.draft_id) === numericId) || null;
}

/**
 * Retrieve the latest pending draft (highest Draft ID).
 * @param {string} dataPath
 * @returns {Promise<Object|null>}
 */
export async function getLatestDraft(dataPath = DEFAULT_DATA_PATH) {
  const drafts = await loadPendingDrafts(dataPath);
  if (drafts.length === 0) return null;

  return drafts.reduce((latest, current) => {
    const currentId = Number(current.id ?? current.draft_id) || 0;
    const latestId = Number(latest.id ?? latest.draft_id) || 0;
    return currentId >= latestId ? current : latest;
  }, drafts[0]);
}

/**
 * Remove a draft from pending drafts.
 * @param {number|string} id
 * @param {string} dataPath
 * @returns {Promise<Object|null>} Removed draft or null
 */
export async function removeDraft(id, dataPath = DEFAULT_DATA_PATH) {
  const drafts = await loadPendingDrafts(dataPath);
  const numericId = Number(id);
  const index = drafts.findIndex((d) => Number(d.id ?? d.draft_id) === numericId);

  if (index === -1) {
    return null;
  }

  const [removedDraft] = drafts.splice(index, 1);
  await savePendingDrafts(drafts, dataPath);
  return removedDraft;
}

/**
 * Approve draft: removes draft from pending queue and marks topic published.
 * If id is omitted/null, defaults to latest draft.
 * @param {number|string} [id]
 * @param {Object} [options]
 * @param {string} [options.dataPath]
 * @param {string} [options.configPath]
 * @returns {Promise<Object>}
 */
export async function approveDraft(id = null, options = {}) {
  const dataPath = options.dataPath || DEFAULT_DATA_PATH;
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;

  let targetId = id;
  if (targetId == null) {
    const latest = await getLatestDraft(dataPath);
    if (!latest) {
      throw new Error('No pending drafts available to approve');
    }
    targetId = latest.id;
  }

  const removed = await removeDraft(targetId, dataPath);
  if (!removed) {
    throw new Error(`Draft ID ${targetId} not found in pending drafts`);
  }

  if (removed.topic_id) {
    try {
      await markTopicPublished(removed.topic_id, configPath);
    } catch {
      // Ignore if topic file does not have topic or topic was manual
    }
  }

  return removed;
}

/**
 * Reject draft: removes draft from pending queue without marking topic published.
 * If id is omitted/null, defaults to latest draft.
 * @param {number|string} [id]
 * @param {Object} [options]
 * @param {string} [options.dataPath]
 * @returns {Promise<Object>}
 */
export async function rejectDraft(id = null, options = {}) {
  const dataPath = options.dataPath || DEFAULT_DATA_PATH;

  let targetId = id;
  if (targetId == null) {
    const latest = await getLatestDraft(dataPath);
    if (!latest) {
      throw new Error('No pending drafts available to reject');
    }
    targetId = latest.id;
  }

  const removed = await removeDraft(targetId, dataPath);
  if (!removed) {
    throw new Error(`Draft ID ${targetId} not found in pending drafts`);
  }

  return removed;
}

/**
 * CLI Argument parser
 * @param {string[]} args
 */
function parseCliArgs(args) {
  const parsed = {
    flags: {},
    values: {}
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        parsed.values[key] = nextArg;
        parsed.flags[key] = true;
        i++;
      } else {
        parsed.flags[key] = true;
      }
    }
  }

  return parsed;
}

/**
 * CLI Handler
 */
export async function runCli(args = process.argv.slice(2)) {
  const parsed = parseCliArgs(args);
  const configPath = parsed.values.config || DEFAULT_CONFIG_PATH;
  const dataPath = parsed.values.data || DEFAULT_DATA_PATH;
  const assetsDir = parsed.values.assets || DEFAULT_ASSETS_DIR;

  try {
    if (parsed.flags.help) {
      console.log(`
Topic Manager & Staging Engine CLI
Usage:
  node scripts/topic_manager.js --next               Get the next pending topic
  node scripts/topic_manager.js --stage              Stage the next topic as a pending draft
  node scripts/topic_manager.js --list-topics        List all topics
  node scripts/topic_manager.js --list-drafts        List all pending drafts
  node scripts/topic_manager.js --get-draft [id]     Get draft by ID (or latest if omitted)
  node scripts/topic_manager.js --approve [id]       Approve draft and mark topic published
  node scripts/topic_manager.js --reject [id]        Reject draft (removes without publishing topic)
  node scripts/topic_manager.js --resolve-asset <slug> Resolve visual asset for a slug

Options:
  --config <path>   Path to post_topics.json
  --data <path>     Path to pending_drafts.json
  --assets <path>   Path to assets directory
`);
      return;
    }

    if (parsed.flags.next) {
      const topic = await getNextTopic({ configPath });
      console.log(JSON.stringify(topic, null, 2));
      return;
    }

    if (parsed.flags.stage) {
      const draft = await stageDraft(null, { configPath, dataPath, assetsDir });
      console.log(JSON.stringify(draft, null, 2));
      return;
    }

    if (parsed.flags['list-topics']) {
      const topics = await loadTopics(configPath);
      console.log(JSON.stringify(topics, null, 2));
      return;
    }

    if (parsed.flags['list-drafts'] || parsed.flags.drafts) {
      const drafts = await loadPendingDrafts(dataPath);
      console.log(JSON.stringify(drafts, null, 2));
      return;
    }

    if (parsed.flags['get-draft']) {
      const targetId = parsed.values['get-draft'];
      const draft = targetId ? await getDraftById(targetId, dataPath) : await getLatestDraft(dataPath);
      if (!draft) {
        console.error(JSON.stringify({ error: `Draft not found: ${targetId || 'latest'}` }));
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(draft, null, 2));
      return;
    }

    if (parsed.flags.approve) {
      const targetId = parsed.values.approve;
      const approved = await approveDraft(targetId, { configPath, dataPath });
      console.log(JSON.stringify({ status: 'approved', draft: approved }, null, 2));
      return;
    }

    if (parsed.flags.reject) {
      const targetId = parsed.values.reject;
      const rejected = await rejectDraft(targetId, { dataPath });
      console.log(JSON.stringify({ status: 'rejected', draft: rejected }, null, 2));
      return;
    }

    if (parsed.flags['resolve-asset']) {
      const slug = parsed.values['resolve-asset'];
      const topics = await loadTopics(configPath);
      const topic = topics.find((t) => t.slug === slug) || { slug, title: slug, concept: '', keywords: [] };
      const asset = resolveVisualAsset(topic, assetsDir);
      console.log(JSON.stringify(asset, null, 2));
      return;
    }

    // Default if no flag provided: show help
    console.log('No action specified. Run with --help to see available options, or --next for next topic.');
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }, null, 2));
    process.exitCode = 1;
  }
}

// Auto-run if executed directly as entrypoint
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runCli();
}
