// Generates a NEW general technical topic every run (never repeats), then a post about it.
// No project grounding: the post teaches/argues a technical idea instead of claiming a personal incident.

import fs from 'node:fs';
import path from 'node:path';
import { resolveDataPath } from './path_resolver.js';

const HISTORY_FILE = 'topic_history.json'; // stored in data/

export const AUTHOR_BIO =
  'Mahmoud H. Almodalal — Backend & AI Systems Engineer (Python/Django, Computer Vision, AI Agents, RAG, PostgreSQL/PostGIS, Redis, Docker, Node.js).';

export const TOPIC_AREAS = [
  // Computer Vision (4 sub-areas)
  'Computer Vision: Real-time RTSP/WebRTC video ingestion, frame dropping strategies, and jitter buffers',
  'Computer Vision: Object detection and tracking with YOLOv8, DeepSort, and Kalman filter tuning',
  'Computer Vision: High-throughput facial recognition and vector embedding extraction with InsightFace',
  'Computer Vision: Zero-copy GPU memory management, CUDA acceleration, and PyTorch/OpenCV pipelines',

  // Django (4 sub-areas)
  'Django: Advanced ORM query planning, EXPLAIN ANALYZE, and PostgreSQL specialized indexing',
  'Django: Concurrency control, database transactions, select_for_update, and row-level locking',
  'Django: Celery background worker consistency, transactional outbox pattern, and idempotent tasks',
  'Django: Channels, WebSockets, ASGI async boundaries, and Redis channel layer backpressure',

  // AI Agents (4 sub-areas)
  'AI Agents: Multi-step tool calling orchestration, finite state machines, and execution loops',
  'AI Agents: Deterministic guardrails, schema enforcement, and grammar-guided structured JSON output',
  'AI Agents: Failure recovery, API retry backoff policies, and graceful degradation fallbacks',
  'AI Agents: Working memory management, token budgeting, and sandboxed tool execution security',

  // RAG (4 sub-areas)
  'RAG: Hybrid search combining BM25 sparse keyword filtering and pgvector dense semantic search',
  'RAG: Two-stage retrieval, Reciprocal Rank Fusion (RRF), and Cross-Encoder reranking',
  'RAG: Multi-tenant semantic caching with Redis vector similarity and tenant isolation',
  'RAG: Document ingestion pipelines, hierarchical chunking, and contextual compression',
];

// ---------------- history (so topics never repeat) ----------------
export function loadTopicHistory(historyPath = resolveDataPath(HISTORY_FILE)) {
  try {
    if (!fs.existsSync(historyPath)) return [];
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveTopicToHistory(entry, historyPath = resolveDataPath(HISTORY_FILE)) {
  const history = loadTopicHistory(historyPath);
  history.push({ ...entry, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  return history;
}

function tokens(s) {
  return new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

export function isDuplicateTopic(title, history, threshold = 0.5) {
  const a = tokens(title);
  if (a.size === 0) return false;
  return history.some((h) => {
    const b = tokens(h.title);
    const inter = [...a].filter((t) => b.has(t)).length;
    const union = new Set([...a, ...b]).size || 1;
    return inter / union >= threshold;
  });
}

// Rotate area: the least recently used one comes next.
export function pickArea(history) {
  const lastUse = new Map(TOPIC_AREAS.map((a) => [a, -1]));
  history.forEach((h, i) => {
    if (lastUse.has(h.area)) lastUse.set(h.area, i);
  });
  return [...lastUse.entries()].sort((x, y) => x[1] - y[1])[0][0];
}

// Alternate Arabic / English (English matters for the German/EU job market).
export function chooseLanguage(history, ratioEnglish = 0.5) {
  const last = history[history.length - 1]?.language;
  if (!last) return 'ar';
  if (ratioEnglish === 0.5) return last === 'ar' ? 'en' : 'ar';
  return Math.random() < ratioEnglish ? 'en' : 'ar';
}

// ---------------- topic idea generation ----------------
export function buildTopicIdeaPrompt({ area, history }) {
  const recent = history.slice(-60).map((h) => `- ${h.title}`).join('\n') || '(none yet)';
  return `You are a senior backend and AI systems engineer planning advanced LinkedIn content for experienced engineers.

Propose ONE new, specific, advanced topic in this selected area: ${area}

Rules:
- Stay within the selected area. For Computer Vision topics, use concrete OpenCV, YOLO, tracking (DeepSort), face analysis (InsightFace), or video streaming mechanisms; for Django topics, use a real Django/Python/PostgreSQL mechanism; for AI Agents/RAG topics, use a concrete mechanism such as retrieval, chunking, embeddings, reranking, tool orchestration, structured outputs, or permission-aware context handling.
- Make it specific and senior-level, not a broad subject or beginner checklist.
- Explain a real mechanism, trade-off, failure mode, or decision boundary; no invented tools or statistics.
- Keep it general and educational. Do not invent a personal incident, company, client, project, test, or result.
- Must NOT overlap with any of these already-used topics:
${recent}

Return ONLY valid JSON, no markdown fences:
{"title": "...", "concept": "2-3 sentences describing the core technical idea and the key mechanism", "keywords": ["...", "...", "..."], "slug": "kebab-case-slug"}`;
}

export function isVisionSpecific(text) {
  return /\b(?:computer[- ]vision|OpenCV|YOLOv[0-9]+|YOLO|DeepSort|InsightFace|RTSP|WebRTC|video pipelines?|object tracking|face recognition|CUDA|GpuMat|frame dropping|jitter buffer)\b/i.test(String(text || ''));
}

export function isAiSpecific(text) {
  return /\b(?:AI\s+agents?|RAG|LLMs?|large language models?|pgvector|vector search|rerank(?:ing)?|embeddings?|semantic caching|BM25|Reciprocal Rank Fusion|RRF|tool calling|guardrails|structured output|context window|LangChain|LlamaIndex|inference pipeline)\b/i.test(String(text || ''));
}

export function isDjangoSpecific(text) {
  return /\b(?:Django|Django REST Framework|DRF|QuerySet|Celery|transaction\.atomic|transaction\.on_commit|select_for_update|Channels|ASGI|prefetch_related|select_related)\b/i.test(String(text || ''));
}

export function topicFromTechnicalSeed(input, { language = 'ar' } = {}) {
  const sourceText = String(input || '').trim();
  if (!sourceText) throw new Error('A technical idea is required');

  const firstLine = sourceText.split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim();
  const visionSpecific = isVisionSpecific(sourceText);
  const aiSpecific = isAiSpecific(sourceText);
  const djangoSpecific = isDjangoSpecific(sourceText);

  let title, slugPrefix, concept, keywords, area;

  if (visionSpecific) {
    title = 'Advanced Computer Vision and Video Pipeline Architecture';
    slugPrefix = 'custom-computer-vision';
    concept = 'Extract the underlying technical principle and explain it as a general, advanced Computer Vision and video pipeline design lesson.';
    keywords = ['Computer Vision', 'OpenCV', 'YOLOv8', 'Video Pipelines'];
    area = 'Advanced Computer Vision & video pipelines';
  } else if (aiSpecific) {
    title = 'Advanced AI Agents and RAG architecture';
    slugPrefix = 'custom-ai-agents-rag';
    concept = 'Extract the underlying technical principle and explain it as a general, advanced Python AI/Agents/RAG and backend design lesson.';
    keywords = ['AI Agents', 'RAG', 'Python', 'Backend'];
    area = 'Advanced AI Agents/RAG engineering';
  } else if (djangoSpecific) {
    title = firstLine.slice(0, 120) || 'Advanced Django backend engineering';
    slugPrefix = 'custom-django-backend';
    concept = 'Extract the underlying technical principle and explain it as a general, advanced Django/Python backend design lesson.';
    keywords = ['Django', 'Python', 'Backend', 'PostgreSQL'];
    area = 'Advanced Django/backend engineering';
  } else {
    title = 'Advanced Backend Architecture';
    slugPrefix = 'custom-backend';
    concept = 'Extract the underlying technical principle and explain it as a general, advanced backend engineering lesson.';
    keywords = ['Python', 'Backend', 'Software Architecture', 'System Design'];
    area = 'Advanced Backend engineering';
  }

  return {
    id: `custom-${Date.now()}`,
    slug: `${slugPrefix}-${Date.now()}`,
    title,
    concept,
    keywords,
    area,
    language,
    isGeneral: true,
    isCustomSource: true,
    sourceText,
  };
}

function parseJsonLoose(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * generateText: async (prompt) => string   (wrap your Gemini / Cloudflare call)
 * Returns a topic object ready for buildTopicPostPrompt.
 */
export async function proposeTopic({
  generateText,
  historyPath = resolveDataPath(HISTORY_FILE),
  history = loadTopicHistory(historyPath),
  maxTries = 4,
  ratioEnglish = 0.5,
}) {
  if (typeof generateText !== 'function') {
    throw new Error('proposeTopic requires a generateText(prompt) function');
  }

  const area = pickArea(history);
  const language = chooseLanguage(history, ratioEnglish);
  let lastError = null;

  for (let i = 0; i < maxTries; i++) {
    try {
      const raw = await generateText(buildTopicIdeaPrompt({ area, history }));
      const idea = parseJsonLoose(raw);
      if (!idea.title || !idea.concept) throw new Error('missing title/concept');
      if (isDuplicateTopic(idea.title, history)) throw new Error(`duplicate topic: ${idea.title}`);
      return {
        id: `gen-${Date.now()}`,
        slug: idea.slug || `topic-${Date.now()}`,
        title: idea.title,
        concept: idea.concept,
        keywords: Array.isArray(idea.keywords) ? idea.keywords : [],
        area,
        language,
        isGeneral: true,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Could not generate a fresh topic: ${lastError?.message}`);
}

// ---------------- the post prompt (general, no project) ----------------
export function buildTopicPostPrompt(topic, { innovation = {} } = {}) {
  const isEnglish = topic.language === 'en';
  const angle = innovation?.angle;
  const hook = innovation?.hook;
  const len = innovation?.length;

  const language = isEnglish
    ? 'Language: English. Crisp, direct, professional engineering English.'
    : 'Language: Arabic (clear Modern Standard Arabic, natural technical tone). English only for established technical names (tools, SQL, APIs, patterns, metrics) and hashtags. Never mix any other language or script.';

  const lengthDescription = len?.paragraphs
    ? `130-190 words (${len.paragraphs} concise paragraphs)`
    : '130-190 words (3 concise paragraphs)';

  const angleBlock = angle
    ? `Angle: ${angle.labelAr}. ${angle.directiveAr}
Use this only as a quiet editorial hint; do not force a story or copy a hook template.
Length: ${len?.labelAr || 'balanced'}, ${lengthDescription}.`
    : `Length: ${lengthDescription}.`;

  const sourceSection = topic?.sourceText
    ? `
=== USER'S TECHNICAL SEED (NOT A VERIFIED PERSONAL ACCOUNT) ===
${topic.sourceText}

Use this only as subject matter. If it contains first-person, company, or project claims, do not repeat or attribute them to the author. Extract the underlying idea and explain it through a relevant Python/backend lens: use a Computer Vision lens for vision seeds, a Django/Python backend lens for backend seeds, or an AI Agents/RAG lens when relevant.
`
    : '';

  return `You are an experienced backend and AI systems engineer writing a natural LinkedIn explainer for senior technical readers.

AUDIENCE: HR tech recruiters, Engineering Managers, and Senior Backend Engineers. Prioritize advanced implementation details and sound engineering judgment.
Audience & Hiring Signal: Frame the mechanism around production reliability, cost/latency control, data integrity, and clear architectural ownership — showing how an engineer thinks under real-world constraints.
Honesty & Clarity: Keep all HONESTY RULES intact. Never invent clients, companies, or fake metrics. Focus on one concrete mechanism, its failure mode, and one honest engineering trade-off.

${language}

=== TOPIC (general technical explanation, never a fabricated project story) ===
Title: ${topic.title}
Core idea: ${topic.concept}
Keywords: ${(topic.keywords || []).join(', ')}
${sourceSection}

=== HONESTY RULES (critical) ===
- Keep the post general and relevant to the selected topic (Computer Vision, Django, AI Agents, or RAG). Do NOT claim "في أحد مشاريعنا", "في مشاريعنا", "we built", or any personal production experience.
- Never invent a company, client, team, incident, test, metric, benchmark, or outcome. Clearly label any example as hypothetical.
- Explain the supplied idea through a relevant Python/backend lens, using Computer Vision, Django, or AI Agents/RAG mechanisms where they fit; do not force an unrelated example.
- Explain one precise mechanism and its boundary conditions. Use an actual library or framework feature (e.g. OpenCV/DeepSort, Django/PostgreSQL, agent tool execution, vector search/RRF) when relevant; avoid vague advice.
- Write in an individual, thoughtful voice without pretending to report events. Vary the structure naturally; avoid a rigid incident-postmortem template and stock AI phrases.

=== THIS GENERATION'S ANGLE ===
${angleBlock}

=== POST REQUIREMENTS ===
- LENGTH: ${lengthDescription}. Keep it concise and high-signal.
- FORMAT: Plain text only. No markdown headers, bold, bullets, or section labels. Separate paragraphs with double line-breaks.
- TONE: Natural, specific, and technically advanced. Avoid generic introductions, repetitive hooks, canned transitions, and the stock CTA "اكتبوا لنا في التعليقات".
- Explain the mechanism, when it matters, and one real trade-off or caveat. A small code/API detail is better than several generic recommendations.
- End with a peer question only if it follows naturally; never force a question or a personal story. Finish with 4-6 relevant plain-text hashtags.

Return ONLY the final post text.`;
}
