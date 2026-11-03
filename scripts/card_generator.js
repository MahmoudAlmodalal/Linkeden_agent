import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export const DEFAULT_AUTHOR = {
  name: 'Mahmoud H. Almodalal',
  title: 'Full-Stack Developer · System Design · Web Architecture',
  avatarPath: 'assets/author_avatar_nobg.png',
};

export const COLOR_THEMES = [
  {
    id: 'emerald',
    name: 'Emerald Mint',
    bgDark: '#061318',
    glowColor: '16, 185, 129',
    glowColorSecondary: '6, 182, 212',
    accent1: '#10b981',
    accent2: '#06b6d4',
    pillBg: 'rgba(6, 182, 212, 0.14)',
    pillBorder: 'rgba(6, 182, 212, 0.4)',
    pillText: '#22d3ee',
    iconBorder: 'rgba(6, 182, 212, 0.55)',
    iconGlow: 'rgba(6, 182, 212, 0.35)',
    bulletColor: '#10b981',
    accentBar: 'linear-gradient(90deg, #10b981, #06b6d4)',
  },
  {
    id: 'violet',
    name: 'Electric Violet',
    bgDark: '#0e0b1c',
    glowColor: '139, 92, 246',
    glowColorSecondary: '236, 72, 153',
    accent1: '#a855f7',
    accent2: '#ec4899',
    pillBg: 'rgba(168, 85, 247, 0.14)',
    pillBorder: 'rgba(168, 85, 247, 0.4)',
    pillText: '#c084fc',
    iconBorder: 'rgba(168, 85, 247, 0.55)',
    iconGlow: 'rgba(168, 85, 247, 0.35)',
    bulletColor: '#ec4899',
    accentBar: 'linear-gradient(90deg, #a855f7, #ec4899)',
  },
  {
    id: 'sapphire',
    name: 'Cyber Sapphire',
    bgDark: '#061122',
    glowColor: '14, 165, 233',
    glowColorSecondary: '59, 130, 246',
    accent1: '#0ea5e9',
    accent2: '#3b82f6',
    pillBg: 'rgba(14, 165, 233, 0.14)',
    pillBorder: 'rgba(14, 165, 233, 0.4)',
    pillText: '#38bdf8',
    iconBorder: 'rgba(14, 165, 233, 0.55)',
    iconGlow: 'rgba(14, 165, 233, 0.35)',
    bulletColor: '#0ea5e9',
    accentBar: 'linear-gradient(90deg, #0ea5e9, #3b82f6)',
  },
  {
    id: 'amber',
    name: 'Sunset Amber',
    bgDark: '#140c06',
    glowColor: '245, 158, 11',
    glowColorSecondary: '239, 68, 68',
    accent1: '#f59e0b',
    accent2: '#f97316',
    pillBg: 'rgba(245, 158, 11, 0.14)',
    pillBorder: 'rgba(245, 158, 11, 0.4)',
    pillText: '#fbbf24',
    iconBorder: 'rgba(245, 158, 11, 0.55)',
    iconGlow: 'rgba(245, 158, 11, 0.35)',
    bulletColor: '#f59e0b',
    accentBar: 'linear-gradient(90deg, #f59e0b, #f97316)',
  },
  {
    id: 'ruby',
    name: 'Crimson Ruby',
    bgDark: '#16080e',
    glowColor: '244, 63, 94',
    glowColorSecondary: '251, 113, 133',
    accent1: '#f43f5e',
    accent2: '#fb7185',
    pillBg: 'rgba(244, 63, 94, 0.14)',
    pillBorder: 'rgba(244, 63, 94, 0.4)',
    pillText: '#fda4af',
    iconBorder: 'rgba(244, 63, 94, 0.55)',
    iconGlow: 'rgba(244, 63, 94, 0.35)',
    bulletColor: '#f43f5e',
    accentBar: 'linear-gradient(90deg, #f43f5e, #fb7185)',
  },
  {
    id: 'lime',
    name: 'Matrix Lime',
    bgDark: '#091307',
    glowColor: '132, 204, 22',
    glowColorSecondary: '16, 185, 129',
    accent1: '#84cc16',
    accent2: '#10b981',
    pillBg: 'rgba(132, 204, 22, 0.14)',
    pillBorder: 'rgba(132, 204, 22, 0.4)',
    pillText: '#bef264',
    iconBorder: 'rgba(132, 204, 22, 0.55)',
    iconGlow: 'rgba(132, 204, 22, 0.35)',
    bulletColor: '#84cc16',
    accentBar: 'linear-gradient(90deg, #84cc16, #10b981)',
  }
];

const THEME_STATE_FILE = path.resolve(process.cwd(), 'data', 'card_theme_state.json');

/**
 * Retrieves the next color theme sequentially to guarantee a new color style every generation.
 */
export function getNextTheme(stateFile = THEME_STATE_FILE) {
  let currentIndex = 0;
  try {
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (typeof state?.lastIndex === 'number') {
        currentIndex = (state.lastIndex + 1) % COLOR_THEMES.length;
      }
    }
  } catch {
    currentIndex = 0;
  }

  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ lastIndex: currentIndex, themeId: COLOR_THEMES[currentIndex].id }, null, 2));
  } catch {
    // Ignore state write errors
  }

  return COLOR_THEMES[currentIndex];
}

/**
 * Resolves theme by ID or falls back to sequentially selected theme.
 */
export function resolveTheme(themeInput) {
  if (typeof themeInput === 'object' && themeInput?.bgDark) return themeInput;
  if (typeof themeInput === 'string') {
    const found = COLOR_THEMES.find((t) => t.id.toLowerCase() === themeInput.toLowerCase());
    if (found) return found;
  }
  return getNextTheme();
}

/**
 * Renders SVG icon matching the topic category.
 */
export function getIconSVG(type = 'target', theme) {
  const icon = type.toLowerCase();
  if (icon === 'database' || icon === 'db' || icon === 'sql') {
    return `
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="16" rx="20" ry="8" fill="rgba(255,255,255,0.08)" stroke="${theme.accent2}" stroke-width="2.5"/>
        <path d="M12 16V28C12 32.4 20.9 36 32 36C43.1 36 52 32.4 52 28V16" stroke="${theme.accent1}" stroke-width="2.5" fill="none"/>
        <path d="M12 28V40C12 44.4 20.9 48 32 48C43.1 48 52 44.4 52 40V28" stroke="${theme.accent2}" stroke-width="2.5" fill="none"/>
        <ellipse cx="32" cy="40" rx="8" ry="3" fill="${theme.accent1}" opacity="0.4"/>
      </svg>
    `;
  }
  if (icon === 'shield' || icon === 'security' || icon === 'lock') {
    return `
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
        <path d="M32 8L48 14V30C48 41.5 41.2 51.8 32 56C22.8 51.8 16 41.5 16 30V14L32 8Z" fill="rgba(255,255,255,0.06)" stroke="${theme.accent2}" stroke-width="2.5"/>
        <path d="M26 31L30 35L38 27" stroke="${theme.accent1}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
  if (icon === 'lightning' || icon === 'speed' || icon === 'performance') {
    return `
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
        <path d="M34 10L18 34H32L28 54L46 28H32L34 10Z" fill="${theme.accent1}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
  }
  if (icon === 'cloud' || icon === 'distributed' || icon === 'network') {
    return `
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
        <path d="M20 44H44C49 44 53 40 53 35C53 30.5 49.5 27 45.2 26.5C44.4 19.5 38.8 14 32 14C26.5 14 21.8 17.8 20.3 23C15.6 23.6 12 27.6 12 32.5C12 37.8 16.2 42 21.5 42" stroke="${theme.accent1}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="32" cy="29" r="4" fill="${theme.accent2}"/>
      </svg>
    `;
  }
  if (icon === 'brain' || icon === 'ai' || icon === 'rag') {
    return `
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
        <rect x="18" y="18" width="28" height="28" rx="8" stroke="${theme.accent1}" stroke-width="2.5" fill="rgba(255,255,255,0.04)"/>
        <circle cx="32" cy="32" r="5" fill="${theme.accent2}"/>
        <path d="M18 26H12M18 38H12M46 26H52M46 38H52M26 18V12M38 18V12M26 46V52M38 46V52" stroke="${theme.accent1}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `;
  }
  // Default target 3D bullseye
  return `
    <svg width="62" height="62" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="27" fill="rgba(255,255,255,0.03)" stroke="${theme.accent2}" stroke-width="2.5" stroke-dasharray="5 3" opacity="0.6"/>
      <circle cx="32" cy="32" r="19" fill="#ef4444" stroke="#ffffff" stroke-width="1.8"/>
      <circle cx="32" cy="32" r="13" fill="#ffffff" stroke="#ef4444" stroke-width="2.5"/>
      <circle cx="32" cy="32" r="7" fill="#ef4444" />
      <path d="M49 15L34 30" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
      <path d="M42 15L49 15L49 22" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

/**
 * Loads author avatar image and converts to base64 Data URL for standalone HTML rendering.
 */
export function getAvatarDataUrl(avatarPath = DEFAULT_AUTHOR.avatarPath) {
  let resolvedPath = path.resolve(process.cwd(), avatarPath);
  if (!fs.existsSync(resolvedPath)) {
    const fallback = path.resolve(process.cwd(), 'assets', 'author_avatar.jpg');
    if (fs.existsSync(fallback)) {
      resolvedPath = fallback;
    } else {
      return null;
    }
  }
  const ext = path.extname(resolvedPath).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const b64 = fs.readFileSync(resolvedPath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

/**
 * Generates standalone HTML with human-designer craftsmanship, balanced typography, and glassmorphism.
 */
export function generateCardHTML(cardData, theme, author = DEFAULT_AUTHOR) {
  const avatarUrl = getAvatarDataUrl(author.avatarPath);
  const iconType = cardData.icon || 'target';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Cairo:wght@600;700;800&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    background-color: ${theme.bgDark};
    background-image: 
      radial-gradient(circle at 85% 15%, rgba(${theme.glowColor}, 0.20) 0%, transparent 45%),
      radial-gradient(circle at 15% 85%, rgba(${theme.glowColorSecondary}, 0.12) 0%, transparent 40%),
      radial-gradient(circle at 50% 50%, rgba(6, 11, 20, 0.85) 0%, transparent 100%),
      radial-gradient(rgba(255, 255, 255, 0.06) 1.2px, transparent 1.2px);
    background-size: 100% 100%, 100% 100%, 100% 100%, 26px 26px;
    color: #ffffff;
    font-family: 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 85px 85px 95px 85px;
    position: relative;
    overflow: hidden;
  }

  /* Subtle Outer Card Border */
  .frame-border {
    position: absolute;
    inset: 24px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 36px;
    pointer-events: none;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    direction: rtl;
    width: 100%;
    z-index: 2;
  }

  .pill-group {
    display: flex;
    gap: 12px;
  }

  .pill {
    padding: 9px 22px;
    border-radius: 9999px;
    font-size: 20px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    letter-spacing: -0.2px;
  }

  .pill-primary {
    background: ${theme.pillBg};
    border: 1px solid ${theme.pillBorder};
    color: ${theme.pillText};
    backdrop-filter: blur(12px);
  }

  .pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${theme.accent1};
    box-shadow: 0 0 8px ${theme.accent1};
  }

  .pill-secondary {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    backdrop-filter: blur(12px);
  }

  /* Center Content Area */
  .content-area {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: right;
    direction: rtl;
    width: 100%;
    z-index: 2;
    margin-top: -10px;
  }

  .icon-wrapper {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01));
    border: 1.5px solid rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 32px -4px rgba(${theme.glowColor}, 0.25), inset 0 1px 1px rgba(255,255,255,0.2);
    margin-bottom: 32px;
  }

  .title-text {
    font-size: 52px;
    font-weight: 800;
    line-height: 1.38;
    color: #ffffff;
    max-width: 910px;
    letter-spacing: -0.4px;
    text-wrap: balance;
    margin-bottom: 24px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.4);
  }

  .divider-bar {
    width: 72px;
    height: 5px;
    border-radius: 9999px;
    background: ${theme.accentBar};
    box-shadow: 0 0 14px rgba(${theme.glowColor}, 0.45);
    margin-bottom: 38px;
  }

  .bullets-list {
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
  }

  .bullet-row {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 18px;
    font-size: 31px;
    font-weight: 600;
    color: #e2e8f0;
    line-height: 1.56;
    direction: rtl;
    text-align: right;
  }

  .bullet-circle {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${theme.bulletColor};
    box-shadow: 0 0 14px ${theme.bulletColor};
    flex-shrink: 0;
    margin-top: 18px;
  }

  .bullet-body {
    flex: 1;
    text-align: right;
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    z-index: 2;
  }

  .footer-card {
    display: flex;
    align-items: center;
    gap: 20px;
    direction: ltr;
    padding: 12px 28px 12px 20px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(16px);
  }

  .footer-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
  }

  .author-name {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 27px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.2px;
  }

  .author-subtitle {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 18px;
    font-weight: 500;
    color: #94a3b8;
    margin-top: 2px;
  }

  .avatar-frame {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    overflow: hidden;
    position: relative;
    background: radial-gradient(circle, rgba(${theme.glowColor}, 0.3) 0%, #0d1522 85%);
    border: 2px solid ${theme.accent1};
    box-shadow: 0 4px 20px -2px rgba(${theme.glowColor}, 0.5);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 10%;
  }

  .avatar-fallback {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 24px;
    font-weight: 800;
    color: #ffffff;
  }
</style>
</head>
<body>
  <div class="frame-border"></div>

  <!-- Header Tags -->
  <div class="header">
    <div class="pill-group">
      <div class="pill pill-primary">
        <div class="pill-dot"></div>
        <span>${cardData.tag1 || 'نصائح للمطورين'}</span>
      </div>
      <div class="pill pill-secondary">${cardData.tag2 || 'قائمة تحقق'}</div>
    </div>
  </div>

  <!-- Main Body Content -->
  <div class="content-area">
    <div class="icon-wrapper">
      ${getIconSVG(iconType, theme)}
    </div>

    <div class="title-text">${cardData.title}</div>
    <div class="divider-bar"></div>

    <div class="bullets-list">
      ${(cardData.bullets || []).map((b) => `
        <div class="bullet-row">
          <div class="bullet-circle"></div>
          <div class="bullet-body">${b}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Footer Branding -->
  <div class="footer">
    <div class="footer-card">
      <div class="footer-meta">
        <div class="author-name">${author.name}</div>
        <div class="author-subtitle">${author.title}</div>
      </div>
      <div class="avatar-frame">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${author.name}">` : `<div class="avatar-fallback">MA</div>`}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Extracts card title, bullet takeaways, and category tags from raw post text or challenge data.
 */
export function extractCardContent(postText = '', challengeOrTopic = {}) {
  let title = challengeOrTopic.title || '';
  let bullets = [];
  let tag1 = 'نصائح للمطورين';
  let tag2 = 'قائمة تحقق';
  let icon = 'target';

  // Extract Question / Hook
  if (!title && postText) {
    const firstLine = postText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 15 && !l.startsWith('#') && !l.startsWith('http') && !l.startsWith('==='));

    if (firstLine && firstLine.length <= 140) {
      title = firstLine
        .replace(/^[💡\s]+/, '')
        .replace(/^معضلة[^:]*:\s*/, '')
        .trim();
    } else {
      const questionMatch = postText.match(/(?:💡|معضلة|كيف|لماذا)[\s\S]*?[?؟]/);
      if (questionMatch) {
        title = questionMatch[0]
          .replace(/^[💡\s]+/, '')
          .replace(/^معضلة[^:]*:\s*/, '')
          .trim();
      }
    }
  }

  if (!title) {
    title = 'كيف تضمن بناء أنظمة برمجية عالية الكفاءة والموثوقية؟';
  }

  // Extract Bullet points
  if (postText) {
    const lines = postText.split('\n').map((l) => l.trim());
    for (const line of lines) {
      if (/^[•\-*]\s+/.test(line) || /^[0-9]+[.)]\s+/.test(line)) {
        const cleaned = line.replace(/^[•\-*0-9.)\s]+/, '').trim();
        if (cleaned.length > 15 && cleaned.length < 140) {
          bullets.push(cleaned);
        }
      } else if (line.startsWith('الدرس الهندسي:')) {
        const cleaned = line.replace(/^الدرس الهندسي:\s*/, '').trim();
        if (cleaned.length > 15 && cleaned.length < 140) {
          bullets.push(cleaned);
        }
      }
      if (bullets.length >= 3) break;
    }
  }

  if (bullets.length < 3) {
    bullets = [
      'قم بعزل نطاقات الخدمة وتقليل الـ Network Hops غير الضرورية',
      'اعتمد على الـ Distributed Locks و Idempotency لتفادي تضارب البيانات',
      'اتخذ القرارات المعمارية بناءً على قياسات P95 دقيقة في الإنتاج'
    ];
  }

  // Categorize tags and icon
  const combinedContext = `${title} ${(challengeOrTopic.keywords || []).join(' ')} ${challengeOrTopic.category || ''}`.toLowerCase();
  if (combinedContext.includes('postgres') || combinedContext.includes('database') || combinedContext.includes('sql') || combinedContext.includes('gist')) {
    tag1 = 'معمارية البيانات';
    tag2 = 'PostgreSQL';
    icon = 'database';
  } else if (combinedContext.includes('redis') || combinedContext.includes('lock') || combinedContext.includes('concurrency') || combinedContext.includes('race')) {
    tag1 = 'أنظمة موزعة';
    tag2 = 'Concurrency';
    icon = 'shield';
  } else if (combinedContext.includes('rag') || combinedContext.includes('ai') || combinedContext.includes('vector') || combinedContext.includes('bm25')) {
    tag1 = 'ذكاء اصطناعي';
    tag2 = 'Hybrid RAG';
    icon = 'brain';
  } else if (combinedContext.includes('latency') || combinedContext.includes('p95') || combinedContext.includes('throughput')) {
    tag1 = 'الأداء العالي';
    tag2 = 'High Performance';
    icon = 'lightning';
  } else if (combinedContext.includes('multi-tenancy') || combinedContext.includes('school') || combinedContext.includes('cloud')) {
    tag1 = 'Full-Stack';
    tag2 = 'Cloud Architecture';
    icon = 'cloud';
  }

  return {
    title,
    bullets: bullets.slice(0, 3),
    tag1,
    tag2,
    icon,
  };
}

/**
 * Generates and captures high-resolution branded PNG image using headless Chrome.
 */
export async function renderCardImage(cardData, {
  theme = null,
  author = DEFAULT_AUTHOR,
  outputDir = 'data/generated_images',
  filename = null,
} = {}) {
  const selectedTheme = resolveTheme(theme);
  const htmlContent = generateCardHTML(cardData, selectedTheme, author);

  const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const baseName = filename || `card-${Date.now()}-${selectedTheme.id}.png`;
  const tempHtmlPath = path.join(resolvedOutputDir, `temp-${Date.now()}.html`);
  const finalPngPath = path.join(resolvedOutputDir, baseName);
  const relativePngPath = path.join(outputDir, baseName);

  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

  const chromeBin = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .find(bin => {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    });

  if (!chromeBin) {
    throw new Error('Chrome/Chromium executable not found on system');
  }

  try {
    const cmd = `${chromeBin} --headless=new --disable-gpu --no-sandbox --screenshot="${finalPngPath}" --window-size=${CARD_WIDTH},${CARD_HEIGHT} "${tempHtmlPath}"`;
    execSync(cmd, { stdio: 'pipe', timeout: 15000 });
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      try { fs.unlinkSync(tempHtmlPath); } catch {}
    }
  }

  return {
    success: true,
    imagePath: relativePngPath,
    absolutePath: finalPngPath,
    theme: selectedTheme,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
}

// CLI Execution Helper
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');

  if (isDemo) {
    console.log('Generating demo cards across dynamic color themes...');
    const demoData = {
      title: 'كيف تتعلم تقنيات جديدة وأنت مشغول بالعمل كمهندس برمجيات؟',
      bullets: [
        'خصص وقتاً ثابتاً ومقدساً كل يوم (حتى لو 30 دقيقة فقط)',
        'طبّق ما تتعلمه فوراً بمشروع جانبي صغير حقيقي',
        'ركز على تقنية واحدة في كل مرة وتجنب التشتت'
      ],
      tag1: 'نصائح للمطورين',
      tag2: 'قائمة تحقق',
      icon: 'target'
    };

    COLOR_THEMES.slice(0, 3).forEach(async (t) => {
      const res = await renderCardImage(demoData, { theme: t, filename: `demo_${t.id}.png` });
      console.log(`Rendered: ${res.imagePath} (${t.name})`);
    });
  }
}
