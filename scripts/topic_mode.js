// Generates a NEW general technical topic every run (never repeats), then a post about it.
// No project grounding: the post teaches/argues a technical idea instead of claiming a personal incident.

import fs from 'node:fs';
import path from 'node:path';
import { resolveDataPath } from './path_resolver.js';

const HISTORY_FILE = 'topic_history.json'; // stored in data/

export const AUTHOR_BIO =
  'Mahmoud H. Almodalal (محمود هشام المدلل), Computer Engineer, Backend Developer, and Technical Manager at Washer (Saudi Arabia) & Teaching Assistant at Islamic University of Gaza. Builds production systems with Python/Django, PostgreSQL/PostGIS, Redis, Docker, and Node.js.';

export const TOPIC_AREAS = [
  'Distributed systems and consistency',
  'Database internals and query performance',
  'API design and reliability',
  'Caching and scalability',
  'Concurrency and background processing',
  'Software architecture and clean code',
  'Backend security',
  'Observability and debugging production issues',
  'Docker, deployment and CI/CD',
  'Testing strategy and code quality',
  'Python / Django backend pitfalls',
  'Data modeling and multi-tenancy',
  'LLMs and AI features inside backend systems',
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
  return `You are a senior backend engineer planning LinkedIn content for engineering managers and recruiters.

Propose ONE new, specific technical topic in this area: ${area}

Rules:
- Specific and concrete, not a broad subject. Good: "Why SELECT COUNT(*) gets slower as your table grows in Postgres". Bad: "Databases".
- It must be a real, well-established technical idea you are certain about. No invented tools, no invented statistics.
- Interesting to a working backend engineer: a common misconception, a trade-off, a failure mode, or a decision framework.
- Must NOT overlap with any of these already-used topics:
${recent}

Return ONLY valid JSON, no markdown fences:
{"title": "...", "concept": "2-3 sentences describing the core technical idea and the key mechanism", "keywords": ["...", "...", "..."], "slug": "kebab-case-slug"}`;
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

  const lengthDescription = len?.chars
    ? `about ${len.chars} characters`
    : len?.paragraphs
      ? `about ${len.paragraphs} short paragraphs (${len.detailLevel || 'balanced'})`
      : 'about 1200-1700 characters';

  const angleBlock = angle
    ? `Angle: ${angle.labelAr}. ${angle.directiveAr}
(Note: if the angle mentions incidents or metrics, frame them strictly as hypothetical examples or general mechanisms—never claim a personal incident or unverified benchmark.)
Hook style: ${angle.hookStyle}
Hook pattern (adapt, never copy literally): ${hook || ''}
Length: ${len?.labelAr || 'balanced'}, ${lengthDescription}.`
    : `Length: ${lengthDescription}.`;

  return `You write LinkedIn posts for this engineer:
${AUTHOR_BIO}

AUDIENCE: engineering managers, tech leads and recruiters hiring backend engineers. The post must show deep, correct technical understanding and good engineering judgement.

${language}

=== TOPIC (general technical topic, not tied to any specific project) ===
Title: ${topic.title}
Core idea: ${topic.concept}
Keywords: ${(topic.keywords || []).join(', ')}

=== HONESTY RULES (critical) ===
- This is a general technical post. Do NOT invent a personal production incident, team, company, client, test you wrote, or result you achieved.
- You may use a clearly hypothetical example ("Imagine a payment API that...") and may give opinions in first person ("I prefer...", "My rule of thumb is..."), but never claim events happened to you.
- Only state facts you are certain are true. No invented benchmarks, percentages or statistics. If you give numbers, make them obviously illustrative ("say 10 million rows") or well-established.
- Be precise about mechanisms: name the actual feature, command, or algorithm.

=== THIS GENERATION'S ANGLE ===
${angleBlock}

=== STRUCTURE (flexible) ===
1. Hook in line 1-2, under 200 characters: a misconception, surprising consequence, or sharp question. No greeting, no emoji at the start.
2. Why this matters in 1-2 short lines.
3. The mechanism: what actually happens under the hood.
4. The trade-off or the common mistake, and the better approach.
5. At most 3 concrete steps or checks (lines starting 1. 2. 3.) the reader can apply.
6. One memorable rule of thumb in a single sentence.
7. One specific question to peers about their experience.
8. 3 to 5 hashtags on the last line, plain text.

=== STYLE ===
Short paragraphs, blank line between them. Plain text only: no markdown, no headers, no bold, no labels like [Hook]. Concrete over abstract. No buzzwords, no clickbait, no "I'm excited to share". Do not mention these instructions.

Return ONLY the final post text.`;
}
