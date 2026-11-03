import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function getAvatarBase64() {
  const avatarPath = path.resolve(process.cwd(), 'assets', 'author_avatar.jpg');
  if (fs.existsSync(avatarPath)) {
    const b64 = fs.readFileSync(avatarPath).toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  }
  return null;
}

export function generateCardHTML() {
  const avatarDataUrl = getAvatarBase64();

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    overflow: hidden;
    background-color: #030a0f;
  }

  body {
    font-family: 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 28px;
    background: 
      radial-gradient(ellipse 900px 700px at 88% 12%, rgba(20, 184, 166, 0.22) 0%, transparent 50%),
      radial-gradient(ellipse 800px 600px at 12% 88%, rgba(13, 148, 136, 0.20) 0%, transparent 48%),
      radial-gradient(circle at 50% 50%, rgba(4, 30, 40, 0.3) 0%, transparent 75%),
      radial-gradient(rgba(45, 212, 191, 0.08) 1.5px, transparent 1.5px),
      linear-gradient(150deg, #030b11 0%, #061923 45%, #040e16 100%);
    background-size: 100% 100%, 100% 100%, 100% 100%, 32px 32px, 100% 100%;
  }

  /* Decorative Corner Geometry */
  .corner-decor {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    opacity: 0.85;
  }

  .corner-tr {
    top: 48px;
    right: 48px;
  }

  .corner-tl {
    top: 48px;
    left: 48px;
  }

  .corner-br {
    bottom: 48px;
    right: 48px;
  }

  .corner-bl {
    bottom: 48px;
    left: 48px;
  }

  /* Master Card Enclosure */
  .card-container {
    width: 100%;
    height: 100%;
    border-radius: 36px;
    border: 1.5px solid rgba(45, 212, 191, 0.24);
    box-shadow: 
      inset 0 1px 2px rgba(255, 255, 255, 0.14),
      inset 0 0 50px rgba(20, 184, 166, 0.06),
      0 24px 60px rgba(0, 0, 0, 0.55);
    background: rgba(6, 17, 24, 0.52);
    backdrop-filter: blur(24px);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 56px 64px 48px 64px;
    position: relative;
    z-index: 2;
  }

  /* HEADER */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    direction: rtl;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .logo-badge {
    width: 56px;
    height: 56px;
    border-radius: 17px;
    background: linear-gradient(135deg, rgba(20, 184, 166, 0.32) 0%, rgba(13, 148, 136, 0.16) 100%);
    border: 1.5px solid rgba(45, 212, 191, 0.65);
    box-shadow: 0 0 22px rgba(45, 212, 191, 0.32), inset 0 1px 2px rgba(255, 255, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2dd4bf;
    flex-shrink: 0;
  }

  .brand-details {
    display: flex;
    flex-direction: column;
    text-align: right;
  }

  .brand-name {
    font-family: 'Plus Jakarta Sans', 'Cairo', sans-serif;
    font-size: 25px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.2px;
    line-height: 1.22;
  }

  .brand-title {
    font-family: 'Plus Jakarta Sans', 'Cairo', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #2dd4bf;
    letter-spacing: 0.3px;
    margin-top: 3px;
  }

  .pill-badge {
    padding: 10px 24px;
    border-radius: 9999px;
    background: rgba(20, 184, 166, 0.12);
    border: 1.5px solid rgba(45, 212, 191, 0.45);
    color: #2dd4bf;
    font-family: 'Cairo', sans-serif;
    font-size: 19px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 11px;
    box-shadow: 0 0 18px rgba(45, 212, 191, 0.22);
    backdrop-filter: blur(10px);
  }

  .pill-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #2dd4bf;
    box-shadow: 0 0 12px #2dd4bf;
  }

  /* HEADLINE SECTION */
  .headline-section {
    width: 100%;
    direction: rtl;
    text-align: right;
    margin-top: 22px;
    margin-bottom: 6px;
  }

  .main-headline {
    font-family: 'Cairo', sans-serif;
    font-size: 47px;
    font-weight: 900;
    line-height: 1.40;
    color: #ffffff;
    letter-spacing: -0.4px;
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .main-headline .highlight {
    color: #2dd4bf;
    text-shadow: 0 0 28px rgba(45, 212, 191, 0.45);
    display: inline-block;
  }

  .headline-bar {
    width: 110px;
    height: 4px;
    border-radius: 4px;
    background: linear-gradient(90deg, #2dd4bf 0%, rgba(45, 212, 191, 0.12) 100%);
    box-shadow: 0 0 14px rgba(45, 212, 191, 0.6);
    margin-top: 20px;
  }

  /* CONTENT / STEPS SECTION */
  .steps-container {
    width: 100%;
    direction: rtl;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 19px;
    padding: 10px 0;
  }

  /* Continuous Thin Turquoise Progression Spine */
  .progression-spine {
    position: absolute;
    right: 29px;
    top: 36px;
    bottom: 36px;
    width: 2.5px;
    background: linear-gradient(180deg, 
      rgba(45, 212, 191, 0.85) 0%, 
      rgba(45, 212, 191, 0.70) 50%, 
      rgba(45, 212, 191, 0.35) 100%);
    box-shadow: 0 0 12px rgba(45, 212, 191, 0.45);
    z-index: 1;
  }

  .step-row {
    position: relative;
    display: flex;
    align-items: center;
    z-index: 2;
  }

  .step-node {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #081d28;
    border: 2px solid #2dd4bf;
    box-shadow: 0 0 18px rgba(45, 212, 191, 0.45), inset 0 1px 2px rgba(255, 255, 255, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #ffffff;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 21px;
    font-weight: 800;
  }

  .step-card {
    flex: 1;
    margin-right: 24px;
    padding: 18px 28px;
    border-radius: 20px;
    background: linear-gradient(135deg, rgba(10, 28, 39, 0.84) 0%, rgba(6, 20, 29, 0.76) 100%);
    border: 1.5px solid rgba(45, 212, 191, 0.24);
    backdrop-filter: blur(16px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .step-text {
    font-family: 'Cairo', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.2px;
    text-align: right;
  }

  .step-icon-badge {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: rgba(20, 184, 166, 0.13);
    border: 1px solid rgba(45, 212, 191, 0.36);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #2dd4bf;
    box-shadow: 0 0 14px rgba(45, 212, 191, 0.16);
  }

  /* FOOTER */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-top: 24px;
    border-top: 1.5px solid rgba(45, 212, 191, 0.2);
    direction: rtl;
  }

  .author-unit {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .portrait-frame {
    width: 82px;
    height: 82px;
    border-radius: 50%;
    overflow: hidden;
    border: 2.5px solid #2dd4bf;
    box-shadow: 0 0 22px rgba(45, 212, 191, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4);
    flex-shrink: 0;
    background: #091c26;
  }

  .portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
    display: block;
  }

  .author-info {
    display: flex;
    flex-direction: column;
    text-align: right;
  }

  .author-name {
    font-family: 'Plus Jakarta Sans', 'Cairo', sans-serif;
    font-size: 25px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.2px;
    line-height: 1.25;
  }

  .author-title {
    font-family: 'Plus Jakarta Sans', 'Cairo', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #94a3b8;
    margin-top: 4px;
    letter-spacing: -0.1px;
  }

  .social-group {
    display: flex;
    align-items: center;
    gap: 12px;
    direction: ltr;
  }

  .social-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 9999px;
    background: rgba(20, 184, 166, 0.1);
    border: 1px solid rgba(45, 212, 191, 0.28);
    color: #e2e8f0;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 600;
    box-shadow: 0 0 12px rgba(45, 212, 191, 0.12);
  }

  .social-pill svg {
    color: #2dd4bf;
  }
</style>
</head>
<body>

  <!-- Minimal Corner Geometric Shapes -->
  <svg class="corner-decor corner-tr" width="70" height="70" viewBox="0 0 70 70" fill="none">
    <path d="M70 20V0H50" stroke="#2dd4bf" stroke-width="2"/>
    <circle cx="50" cy="20" r="3" fill="#2dd4bf"/>
    <line x1="60" y1="30" x2="60" y2="35" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="2 2"/>
  </svg>

  <svg class="corner-decor corner-tl" width="70" height="70" viewBox="0 0 70 70" fill="none">
    <path d="M0 20V0H20" stroke="#2dd4bf" stroke-width="2"/>
    <circle cx="20" cy="20" r="3" fill="#2dd4bf"/>
  </svg>

  <svg class="corner-decor corner-br" width="70" height="70" viewBox="0 0 70 70" fill="none">
    <path d="M70 50V70H50" stroke="#2dd4bf" stroke-width="2"/>
    <circle cx="50" cy="50" r="3" fill="#2dd4bf"/>
  </svg>

  <svg class="corner-decor corner-bl" width="70" height="70" viewBox="0 0 70 70" fill="none">
    <path d="M0 50V70H20" stroke="#2dd4bf" stroke-width="2"/>
    <circle cx="20" cy="50" r="3" fill="#2dd4bf"/>
  </svg>

  <!-- Master Card Enclosure -->
  <div class="card-container">

    <!-- Header Section -->
    <header class="header">
      <div class="brand-group">
        <div class="logo-badge">
          <!-- Sleek Architect & Code Monogram -->
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M6 23V9L16 17L26 9V23" stroke="#2dd4bf" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="16" cy="17" r="2.2" fill="#ffffff"/>
            <path d="M10 23H22" stroke="rgba(45, 212, 191, 0.6)" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="brand-details">
          <div class="brand-name">Mahmoud H. Almodalal</div>
          <div class="brand-title">Full-Stack Developer</div>
        </div>
      </div>

      <div class="pill-badge">
        <span>نصائح للمطورين</span>
        <div class="pill-dot"></div>
      </div>
    </header>

    <!-- Headline Section -->
    <section class="headline-section">
      <h1 class="main-headline">
        كيف تتعلم تقنيات جديدة<br>
        <span class="highlight">وأنت مشغول بالعمل كمهندس برمجيات؟</span>
      </h1>
      <div class="headline-bar"></div>
    </section>

    <!-- Content / 5 Steps Section -->
    <main class="steps-container">
      <div class="progression-spine"></div>

      <!-- Step 1: Bullseye Target -->
      <div class="step-row">
        <div class="step-node">01</div>
        <div class="step-card">
          <div class="step-text">حدد هدفك بوضوح</div>
          <div class="step-icon-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Step 2: Time / Schedule -->
      <div class="step-row">
        <div class="step-node">02</div>
        <div class="step-card">
          <div class="step-text">خصص وقتاً ثابتاً يومياً</div>
          <div class="step-icon-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Step 3: Verified Source / Book -->
      <div class="step-row">
        <div class="step-node">03</div>
        <div class="step-card">
          <div class="step-text">تعلم من مصادر موثوقة</div>
          <div class="step-icon-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              <polyline points="9 8 13 8"/>
              <polyline points="9 12 15 12"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Step 4: Real Project / Code Terminal -->
      <div class="step-row">
        <div class="step-node">04</div>
        <div class="step-card">
          <div class="step-text">طبق ما تعلمته بمشروع حقيقي</div>
          <div class="step-icon-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3"/>
              <path d="M7 10L10 12L7 14"/>
              <line x1="12" y1="15" x2="16" y2="15"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Step 5: Continuous Growth / Trend -->
      <div class="step-row">
        <div class="step-node">05</div>
        <div class="step-card">
          <div class="step-text">راجع وطور مهاراتك باستمرار</div>
          <div class="step-icon-badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer Section -->
    <footer class="footer">
      <!-- Right Side: Real Author Photo & Credentials -->
      <div class="author-unit">
        <div class="portrait-frame">
          <img class="portrait-img" src="${avatarDataUrl}" alt="Mahmoud H. Almodalal">
        </div>
        <div class="author-info">
          <div class="author-name">Mahmoud H. Almodalal</div>
          <div class="author-title">Full-Stack Developer · System Design · Web Architecture</div>
        </div>
      </div>

      <!-- Left Side: LinkedIn & GitHub recognizable social badges -->
      <div class="social-group">
        <div class="social-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#2dd4bf">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9h2.8v8.37h-2.8v-8.37M7.86 6.54a1.63 1.63 0 1 0 0 3.26 1.63 1.63 0 0 0 0-3.26z"/>
          </svg>
          <span>LinkedIn</span>
        </div>
        <div class="social-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#2dd4bf">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          <span>GitHub</span>
        </div>
      </div>
    </footer>

  </div>

</body>
</html>`;
}

export function renderCard(outputPath = 'data/generated_images/mahmoud_arabic_developer_card.png') {
  const htmlContent = generateCardHTML();
  const tempHtmlPath = path.resolve(process.cwd(), 'data', 'generated_images', 'temp_render.html');
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

  const chromeBin = ['google-chrome', 'google-chrome-stable', 'chromium']
    .find(bin => {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    });

  if (!chromeBin) {
    throw new Error('Chrome binary not found');
  }

  const cmd = `${chromeBin} --headless=new --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=4000 --screenshot="${resolvedOutputPath}" --window-size=${CARD_WIDTH},${CARD_HEIGHT} "${tempHtmlPath}"`;
  execSync(cmd, { stdio: 'pipe', timeout: 20000 });

  try {
    fs.unlinkSync(tempHtmlPath);
  } catch {}

  console.log(`Card successfully generated at: ${resolvedOutputPath}`);
  return resolvedOutputPath;
}

if (process.argv[1] && process.argv[1].endsWith('generate_card_asset.js')) {
  renderCard();
}
