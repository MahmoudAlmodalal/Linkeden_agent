// Code-snippet visual: an editor window with a short, real snippet taken from the post's topic.
// Engineers recognise this format instantly; it avoids the "AI infographic" look.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildCodeCardPrompt({ postText, topic = {} }) {
  return `Write a short, REAL, correct code snippet that illustrates the core mechanism of this LinkedIn post, to be shown as a screenshot of an editor.

Post:
"""
${postText}
"""
Topic: ${topic.title || ''}

Return ONLY valid JSON (no markdown fences):
{"filename":"...","language":"python|sql","code":"...","caption":"..."}

Rules:
- Python (Django / agent loop / retrieval code) or SQL (PostgreSQL / pgvector). Real APIs only: select_for_update, transaction.atomic, prefetch_related, F(), pgvector <=> operator, ts_rank, etc.
- 8 to 16 lines, max 52 characters per line (break long expressions across lines), 4-space indentation, real line breaks as \\n.
- Comments only where a senior engineer would write one (the WHY, one or two lines max). English only inside code.
- Must run conceptually as-is; no placeholder like "..." or "your_code_here". No invented metrics.
- filename: realistic, e.g. "services/orders.py", "retrieval/hybrid.sql".
- caption: ONE short line (max 80 chars) in the post's language stating what to notice. No hashtags.`;
}

export function validateCodeCard(c) {
  const issues = [];
  if (!c || typeof c.code !== 'string') return ['no code'];
  const lines = c.code.split('\n');
  if (lines.length < 6 || lines.length > 16) issues.push('line count out of range');
  if (lines.some((l) => l.length > 54)) issues.push('line too long');
  if (/\.\.\.|your_|TODO|placeholder/i.test(c.code)) issues.push('placeholder code');
  if (!['python', 'sql'].includes(String(c.language).toLowerCase())) issues.push('language');
  if (!c.filename || c.filename.length > 40) issues.push('filename');
  if (!c.caption || c.caption.length > 100) issues.push('caption');
  return issues;
}

function parseJsonLoose(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no JSON in code card output');
  return JSON.parse(t.slice(s, e + 1));
}

export async function generateCodeCard({ generateText, postText, topic, language = 'ar', maxTries = 2 }) {
  let issues = [];
  for (let i = 0; i < maxTries; i++) {
    try {
      const prompt = buildCodeCardPrompt({ postText, topic }) +
        (issues.length ? `\n\nFix these problems from your previous answer: ${issues.join('; ')}` : '');
      const c = parseJsonLoose(await generateText(prompt));
      c.code = String(c.code).replace(/\\n/g, '\n').replace(/\s+$/, '');
      issues = validateCodeCard(c);
      if (!issues.length) return { ...c, language: c.language.toLowerCase(), rtl: language !== 'en' };
    } catch (err) {
      issues = [err.message];
    }
  }
  throw new Error(`code card invalid: ${issues.join('; ')}`);
}

const PY_KW = /\b(def|class|return|if|elif|else|for|in|with|as|import|from|try|except|raise|while|not|and|or|is|None|True|False|async|await|yield|lambda|pass)\b/;
const SQL_KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|ON|WITH|AS|ORDER|BY|LIMIT|GROUP|AND|OR|NOT|IN|CREATE|INDEX|USING|OVER|PARTITION|ROW_NUMBER|COALESCE|DESC|ASC|FULL|OUTER|UNION|ALL|INSERT|INTO|VALUES|UPDATE|SET)\b/i;

function highlightLine(line, lang) {
  const kw = lang === 'sql' ? SQL_KW : PY_KW;
  const cm = lang === 'sql' ? '--' : '#';
  const ci = line.indexOf(cm);
  const code = ci === -1 ? line : line.slice(0, ci);
  const comment = ci === -1 ? '' : line.slice(ci);
  const re = new RegExp(`('[^']*'|"[^"]*")|(\\b\\d+(?:\\.\\d+)?\\b)|${kw.source}|(\\b[A-Za-z_]\\w*)(?=\\()`, 'gi');
  let out = '';
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const tok = esc(m[0]);
    if (m[1]) out += `<i class="s">${tok}</i>`;
    else if (m[2]) out += `<i class="n">${tok}</i>`;
    else if (m[3]) out += `<i class="k">${tok}</i>`;
    else out += `<i class="f">${tok}</i>`;
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  if (comment) out += `<i class="c">${esc(comment)}</i>`;
  return out;
}

export function codeCardHTML({ filename, language, code, caption, rtl = true }) {
  const lines = code.split('\n').map((l, i) =>
    `<div class="ln"><span class="no">${i + 1}</span><span class="tx">${highlightLine(l, language) || '&nbsp;'}</span></div>`).join('');
  const size = code.split('\n').length > 12 ? 25 : 27;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Cairo:wght@600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:#e9e6df;display:flex;flex-direction:column;justify-content:center;padding:70px 64px;font-family:'Cairo',sans-serif}
.win{background:#1f2328;border-radius:18px;box-shadow:0 30px 60px rgba(40,30,10,.28),0 2px 0 rgba(255,255,255,.04) inset;overflow:hidden}
.bar{height:62px;background:#2b3036;display:flex;align-items:center;padding:0 24px;gap:10px}
.dot{width:16px;height:16px;border-radius:50%}
.fn{margin-left:22px;font:600 22px 'JetBrains Mono',monospace;color:#9aa4ae}
.body{padding:34px 0 38px}
.ln{display:flex;font:400 ${size}px/1.62 'JetBrains Mono',monospace;color:#d6dde4;white-space:pre}
.no{width:78px;text-align:right;padding-right:26px;color:#5b6570;flex-shrink:0}
.tx{flex:1}
i{font-style:normal}.k{color:#ff7b72}.s{color:#a5d6ff}.n{color:#79c0ff}.f{color:#d2a8ff}.c{color:#7d8590}
.cap{margin-top:46px;font-weight:700;font-size:40px;line-height:1.5;color:#1c1c1a;direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'}}
.by{margin-top:30px;font:600 24px 'JetBrains Mono',monospace;color:#6b675e;text-align:${rtl ? 'right' : 'left'};direction:ltr}
</style></head><body>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="fn">${esc(filename)}</span></div>
<div class="body">${lines}</div></div>
<div class="cap">${esc(caption)}</div>
<div class="by">Mahmoud Almodalal · Backend &amp; AI</div>
</body></html>`;
}
