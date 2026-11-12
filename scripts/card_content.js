// card_content.js  ->  put in scripts/card_content.js
// Makes the card text come from the post/topic itself (LLM-written, validated),
// instead of regex-guessing lines from the post and falling back to generic filler.

import { extractCardContent } from './generate_card_asset.js';

const FOREIGN_SCRIPTS = /[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0590-\u05FF]/u;

// The old generic defaults in extractCardContent. They must never reach a card.
const GENERIC_PHRASES = [
  'حدد هدفك', 'خصص وقتاً', 'تعلم من مصادر موثوقة', 'طبق ما تعلمته', 'راجع وطور مهاراتك',
  'set clear goals', 'practice daily', 'keep learning',
];

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildCardPrompt({ postText, topic = {}, language = 'ar' }) {
  const isEn = language === 'en';
  const maxStep = isEn ? 70 : 60;
  return `You design the text for a LinkedIn infographic card that accompanies the post below.
The card must summarize THIS post's technical content, nothing generic.

Post:
"""
${postText}
"""
Topic title: ${topic.title || ''}
Keywords: ${(topic.keywords || []).join(', ')}

Return ONLY valid JSON (no markdown fences):
{
  "title": "...",
  "highlight": "...",
  "pill": "...",
  "steps": ["...", "...", "..."]
}

Rules:
- Language: ${isEn ? 'English' : 'Arabic (technical terms such as Redis, Idempotency, P95 stay in English)'}. Same language as the post. No other language or script.
- title: the card headline, max 60 characters. A sharp claim or question about this exact topic (not a copy of the post's first line if that is longer).
- highlight: optional second part of the headline, max 40 characters, or "" if not needed.
- pill: a 2-3 word category label for this topic (e.g. ${isEn ? '"Database Internals", "Distributed Systems"' : '"معمارية البيانات", "أنظمة موزعة"'}).
- steps: 3 to 5 items, each max ${maxStep} characters. Each is a concrete takeaway taken from the post: a mechanism, a rule, a check or a trade-off. Order them logically.
- Do NOT add facts, numbers or tools that are not in the post.
- Do NOT write generic advice (set goals, practice daily, keep learning, etc.).`;
}

function parseJsonLoose(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no JSON object in card output');
  return JSON.parse(cleaned.slice(s, e + 1));
}

function words(s) {
  return new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

export function validateCardContent(card, { postText = '', language = 'ar' } = {}) {
  const issues = [];
  const maxStep = language === 'en' ? 80 : 70;

  if (!card || typeof card !== 'object') return { ok: false, issues: ['not an object'] };
  if (!card.title || card.title.length > 70) issues.push('title missing or too long');
  if (card.highlight && card.highlight.length > 50) issues.push('highlight too long');
  if (!card.pill || card.pill.length > 30) issues.push('pill missing or too long');
  if (!Array.isArray(card.steps) || card.steps.length < 3 || card.steps.length > 5) {
    issues.push('steps must be 3-5 items');
  }

  const all = [card.title, card.highlight, card.pill, ...(card.steps || [])].join(' ');
  if (FOREIGN_SCRIPTS.test(all)) issues.push('foreign script in card text');
  if (GENERIC_PHRASES.some((g) => all.toLowerCase().includes(g.toLowerCase()))) issues.push('generic filler phrase');

  const postWords = words(postText);
  (card.steps || []).forEach((st, i) => {
    if (String(st).length > maxStep) issues.push(`step ${i + 1} too long`);
    // grounding: each step must share at least one meaningful word with the post
    const overlap = [...words(st)].filter((w) => postWords.has(w)).length;
    if (postWords.size && overlap === 0) issues.push(`step ${i + 1} not grounded in the post`);
  });

  return { ok: issues.length === 0, issues };
}

// Fallback when the LLM fails: take real sentences from the post, never generic text.
function sentenceSteps(postText) {
  return String(postText || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .split(/\n+|(?<=[.!؟?])\s+/)
    .map((s) => s.replace(/^[•\-*\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 15 && s.length <= 90)
    .slice(1, 4); // skip the hook line
}

/**
 * generateText: async (prompt) => string
 * Returns { title, highlight, pill, steps, language } ready for generateCardHTML.
 */
export async function generateCardContent({ generateText, postText, topic = {}, language = 'ar', maxTries = 2 }) {
  let lastIssues = [];
  for (let i = 0; i < maxTries; i++) {
    try {
      const prompt = buildCardPrompt({ postText, topic, language }) +
        (lastIssues.length ? `\n\nYour previous answer had these problems, fix them: ${lastIssues.join('; ')}` : '');
      const card = parseJsonLoose(await generateText(prompt));
      const { ok, issues } = validateCardContent(card, { postText, language });
      if (ok) {
        return {
          title: card.title.trim(),
          highlight: (card.highlight || '').trim(),
          pill: card.pill.trim(),
          steps: card.steps.map((s) => String(s).trim()),
          language,
        };
      }
      lastIssues = issues;
    } catch (err) {
      lastIssues = [err.message];
    }
  }

  // Fallback: topic title + real sentences from the post (never the generic defaults)
  const extracted = extractCardContent(postText, topic);
  let steps = sentenceSteps(postText);
  if (steps.length < 3) steps = extracted.steps.filter((s) => !GENERIC_PHRASES.some((g) => s.includes(g)));
  return {
    title: topic.title ? topic.title.slice(0, 70) : extracted.title,
    highlight: '',
    pill: extracted.pill,
    steps: steps.slice(0, 5),
    language,
  };
}
