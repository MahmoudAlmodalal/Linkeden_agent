import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCodeCard, codeCardHTML } from '../scripts/code_card.js';

const ok = { filename: 'a.py', language: 'python', caption: 'x', code: Array(8).fill('x = 1').join('\n') };

describe('code card', () => {
  it('accepts a valid snippet and rejects placeholders / long lines', () => {
    assert.deepEqual(validateCodeCard(ok), []);
    assert.ok(validateCodeCard({ ...ok, code: ok.code + '\n...' }).length);
    assert.ok(validateCodeCard({ ...ok, code: ok.code + '\n' + 'y'.repeat(60) }).length);
  });
  it('escapes HTML in code', () => {
    assert.match(codeCardHTML({ ...ok, code: 'a < b' }), /a &lt; b/);
  });
});
