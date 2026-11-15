// Generates a NEW general technical topic every run (never repeats), then a post about it.
// No project grounding: the post teaches/argues a technical idea instead of claiming a personal incident.

import fs from 'node:fs';
import path from 'node:path';
import { resolveDataPath } from './path_resolver.js';

const HISTORY_FILE = 'topic_history.json'; // stored in data/

export const AUTHOR_BIO =
  'Mahmoud H. Almodalal (محمود هشام المدلل), Backend Engineer & Software Architect, EduTracker Co-founder, Freelance Backend Engineer based in Berlin, Germany. Formerly Technical Manager at Washer (Saudi Arabia) & Teaching Assistant at Islamic University of Gaza. Builds production systems with Python/Django, PostgreSQL/PostGIS, Redis, Docker, and Node.js.';

export const TOPIC_AREAS = [
  'Advanced Django ORM query planning and PostgreSQL indexes',
  'Django transactions, row locking, and idempotency',
  'Django REST Framework serialization and API performance',
  'Django ASGI, async views, and sync/async boundaries',
  'Celery task delivery, retries, and Django transaction consistency',
  'Redis caching, invalidation, and stampede control in Django',
  'Zero-downtime Django schema migrations and deployment safety',
  'Django multi-tenancy, authorization, and backend security',
  'Observability, backpressure, and failure handling in Django services',
  'Testing concurrency and database behavior in Django',
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
  return `You are a senior Python/Django backend engineer planning advanced LinkedIn content for experienced backend developers.

Propose ONE new, specific, advanced Django/Python backend topic in this area: ${area}

Rules:
- Center the topic on a real Django/backend mechanism such as QuerySet evaluation, select_related/prefetch_related, transaction.atomic, select_for_update, transaction.on_commit, UniqueConstraint, async views, Celery delivery, Redis cache invalidation, or PostgreSQL query plans.
- Make it specific and senior-level, not a broad subject or beginner checklist.
- Explain a real mechanism, trade-off, failure mode, or decision boundary; no invented tools or statistics.
- Keep it general and educational. Do not invent a personal incident, company, client, project, test, or result.
- Must NOT overlap with any of these already-used topics:
${recent}

Return ONLY valid JSON, no markdown fences:
{"title": "...", "concept": "2-3 sentences describing the core technical idea and the key mechanism", "keywords": ["...", "...", "..."], "slug": "kebab-case-slug"}`;
}

export function topicFromTechnicalSeed(input, { language = 'ar' } = {}) {
  const sourceText = String(input || '').trim();
  if (!sourceText) throw new Error('A technical idea is required');

  const firstLine = sourceText.split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim();
  const isDjangoSpecific = /\b(?:Django|Django REST Framework|DRF|QuerySet|Celery|transaction\.atomic|select_for_update)\b/i.test(sourceText);
  const title = isDjangoSpecific
    ? (firstLine.slice(0, 120) || 'Advanced Django backend engineering')
    : 'Advanced Django backend architecture';
  return {
    id: `custom-${Date.now()}`,
    slug: `custom-django-backend-${Date.now()}`,
    title,
    concept: 'Extract the underlying technical principle and explain it as a general, advanced Django/Python backend design lesson.',
    keywords: ['Django', 'Python', 'Backend', 'PostgreSQL'],
    area: 'Advanced Django/backend engineering',
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

Use this only as subject matter. If it contains first-person, company, or project claims, do not repeat or attribute them to the author. Extract the underlying idea and explain it generally through a Django/Python backend lens.
`
    : '';

  return `You are an experienced Python/Django backend engineer writing a natural LinkedIn explainer for senior backend peers.

AUDIENCE: Django/backend engineers, tech leads, and engineering managers. Prioritize advanced implementation details and sound engineering judgment.

${language}

=== TOPIC (general technical explanation, never a fabricated project story) ===
Title: ${topic.title}
Core idea: ${topic.concept}
Keywords: ${(topic.keywords || []).join(', ')}
${sourceSection}

=== HONESTY RULES (critical) ===
- Keep the post general and Django/backend-focused. Do NOT claim "في أحد مشاريعنا", "في مشاريعنا", "we built", or any personal production experience.
- Never invent a company, client, team, incident, test, metric, benchmark, or outcome. Clearly label any example as hypothetical.
- If the supplied idea is outside Django, translate only its underlying design principle into a concrete Django/backend example; do not keep the post about an unrelated field.
- Explain one precise mechanism and its boundary conditions. Use an actual Django/Python/PostgreSQL feature when relevant; avoid vague advice.
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
