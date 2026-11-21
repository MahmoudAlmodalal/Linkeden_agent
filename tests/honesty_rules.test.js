import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentPrompt, HONESTY_RULES, STRATEGIC_ANGLES } from '../scripts/gemini_engine.js';

describe('honesty rules', () => {
  it('legacy prompt includes honesty rules and unified length', () => {
    const prompt = buildContentPrompt({ title: 'Idempotency', language: 'en' });
    assert.ok(prompt.includes(HONESTY_RULES));
    assert.match(prompt, /130-(?:180|190) words/);
    assert.doesNotMatch(prompt, /180-260|260 words/);
  });

  it('strategic angles never claim a personal incident or team mistake', () => {
    const text = STRATEGIC_ANGLES.map((a) => a.directiveAr).join('\n');
    assert.doesNotMatch(text, /مررت بها|ارتكبه فريقك/);
  });
});
