// Deterministic pre-review quality checks for generated post text.
// Pure and provider-agnostic: staging decides what to do with the verdict.

import { BANNED_AI_CLICHES } from './gemini_engine.js';

export const LINKEDIN_MAX_CHARS = 3000;
export const MIN_HASHTAGS = 3;
export const MAX_HASHTAGS = 6;
export const MIN_WORDS = 120;
export const MAX_WORDS = 195;
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Counts words supporting Arabic, Latin, and technical tokens */
export function countWords(text) {
  if (!text) return 0;
  const tokens = String(text).trim().match(/[\p{L}\p{N}_-]+/gu);
  return tokens ? tokens.length : 0;
}

/** @returns {{ passed: boolean, issues: string[] }} */
export function checkDraftQuality(text, {
  maxChars = LINKEDIN_MAX_CHARS,
  minHashtags = MIN_HASHTAGS,
  maxHashtags = MAX_HASHTAGS,
  minWords = MIN_WORDS,
  maxWords = MAX_WORDS,
} = {}) {
  const body = String(text || '').trim();
  const issues = [];
  if (!body) return { passed: false, issues: ['Post text is empty'] };

  if (body.length > maxChars) {
    issues.push(`Too long: ${body.length} characters (limit ${maxChars})`);
  }

  const words = countWords(body);
  if (words < minWords) {
    issues.push(`Too short: ${words} words (minimum ${minWords})`);
  } else if (words > maxWords) {
    issues.push(`Too long: ${words} words (maximum ${maxWords})`);
  }

  // Check for banned AI clichés
  for (const phrase of BANNED_AI_CLICHES) {
    if (body.includes(phrase)) {
      issues.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // Check for robotic bracket headers or markdown header tags
  if (/\[\d+\.\s*[^\]]+\]|^\s*\d+\.\s*\[/m.test(body) || /###\s*/.test(body)) {
    issues.push('Contains robotic section brackets or markdown headers');
  }

  const hashtags = new Set(body.match(/(?<![\p{L}\p{N}_/&])#[\p{L}\p{N}_]+/gu) || []);
  if (hashtags.size < minHashtags) {
    issues.push(`Too few hashtags: ${hashtags.size} (need ${minHashtags}-${maxHashtags})`);
  } else if (hashtags.size > maxHashtags) {
    issues.push(`Too many hashtags: ${hashtags.size} (need ${minHashtags}-${maxHashtags})`);
  }

  return { passed: issues.length === 0, issues };
}

export function resolveMaxAttempts(value = process.env.QUALITY_GATE_MAX_ATTEMPTS) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_ATTEMPTS;
}

/**
 * Generate until the gate passes or attempts run out. The last attempt is
 * always returned, with its verdict, so a draft is never silently dropped.
 */
export async function generateWithGate(produce, { maxAttempts = resolveMaxAttempts(), check = checkDraftQuality } = {}) {
  let draft;
  let verdict;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    draft = await produce(attempts);
    verdict = await check(draft.text);
    if (verdict.passed) break;
  }
  return { draft, gate: { passed: verdict.passed, attempts, issues: verdict.issues } };
}
