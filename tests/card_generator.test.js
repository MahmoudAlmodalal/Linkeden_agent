import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateCardHTML,
  extractCardContent,
  renderCardImage,
  DEFAULT_AUTHOR,
  findChromeExecutable,
  CARD_WIDTH,
  CARD_HEIGHT,
} from '../scripts/generate_card_asset.js';
import {
  escapeHtml,
  validateCardContent,
  generateCardContent,
} from '../scripts/card_content.js';

describe('Mahmoud Card Generator - Dynamic Card Rendering', () => {
  it('generates HTML containing Mahmoud H. Almodalal, Full-Stack Developer, and avatar image', () => {
    const cardData = {
      title: 'كيف تبني معمارية ويب عالية الكفاءة؟',
      highlight: 'وأنت تعمل كمهندس برمجيات',
      steps: ['نصيحة أولى في الأداء', 'نصيحة ثانية في الكاش', 'نصيحة ثالثة في القواعد'],
      pill: 'نصائح للمطورين',
    };

    const html = generateCardHTML(cardData, DEFAULT_AUTHOR);

    assert.ok(html.includes('Mahmoud H. Almodalal'));
    assert.ok(html.includes('Full-Stack Developer'));
    assert.ok(html.includes('كيف تبني معمارية ويب عالية الكفاءة؟'));
    assert.ok(html.includes('data:image/'));
    assert.ok(html.includes('1080px'));
    assert.ok(html.includes('1350px'));
  });

  it('extractCardContent extracts question hook and key steps', () => {
    const samplePost = `💡 معضلة معمارية: كيف تضمن استجابة بحث جغرافي أقل من 12ms؟
    
تفاصيل حول الأنظمة وقواعد البيانات...

📌 نصائح للمهندسين:
• اعتمد على إضافة PostGIS مع نوع البيانات GEOMETRY
• أنشئ فهرس GiST لتقليل تعقيد البحث
• استخدم ST_DWithin وتجنب حساب مسافات Haversine برمجياً

💬 سؤال للمهندسين؟`;

    const extracted = extractCardContent(samplePost, {
      keywords: ['postgis', 'postgres', 'spatial'],
      category: 'geospatial-database',
    });

    assert.ok(extracted.title.includes('استجابة بحث جغرافي'));
    assert.ok(extracted.steps.length >= 3);
    assert.ok(extracted.steps[0].includes('PostGIS'));
    assert.ok(extracted.pill.includes('بيانات') || extracted.pill.includes('مطورين'));
  });

  it('extractCardContent extracts hook, numbered steps, and engineering lesson from incident format', () => {
    const post = `استخدام DB::transaction وحده لا يحمي تطبيقك من الـ Race Conditions إذا لم تقفل السجلات أثناء القراءة.

في أحد مشاريع معالجة المدفوعات والاشتراكات، ظهرت مشكلة دقيقة: رصيد العميل ينزل إلى قيمة سالبة عند إرسال طلبين في نفس الجزء من الثانية.

الافتراض الأول كان وجود خطأ في الـ Frontend.

قمت بكتابة اختبار آلي يحاكي طلبين متزامنين على نفس الحساب للتأكد من المشكلة.

السبب الجذري: الـ Transaction تضمن الذرية (Atomicity) فقط، لكنها لا تمنع العمليات الأخرى.

الحل كان في خطوتين مباشرتين:
1. استخدام Pessimistic Locking عبر استدعاء lockForUpdate عند جلب سجل الرصيد.
2. الاعتماد على العمليات الذرية المباشرة في قاعدة البيانات مثل decrement.

الدرس الهندسي: لا تعتمد على حماية الواجهة لمنع تكرار العمليات الحساسة، وقاعدة البيانات هي خط الدفاع الحقيقي الوحيد.

كيف تتعامل مع معالجة الرصيد والعمليات المالية المتزامنة في مشاريعك؟
اكتبوا لنا في التعليقات 👇

#Laravel #PHP #WebDevelopment #DatabaseDesign #SoftwareEngineering`;

    const extracted = extractCardContent(post, {
      keywords: ['laravel', 'concurrency', 'transactions', 'race-condition'],
      category: 'database-concurrency',
    });

    assert.ok(extracted.title.includes('Race Conditions') || extracted.title.includes('DB::transaction'));
    assert.ok(extracted.steps.length >= 3);
    assert.ok(extracted.steps[0].includes('lockForUpdate'));
    assert.ok(extracted.steps[1].includes('decrement'));
    assert.ok(extracted.steps[2].includes('الواجهة'));
  });

  it('renderCardImage generates valid 1080x1350 PNG file via headless Chrome', async () => {
    const cardData = {
      title: 'كيف تتعلم تقنيات جديدة وأنت مشغول بالعمل كمهندس برمجيات؟',
      steps: [
        'خصص وقتاً ثابتاً ومقدساً كل يوم',
        'طبّق ما تتعلمه فوراً بمشروع جانبي صغير',
        'ركز على تقنية واحدة في كل مرة'
      ],
      pill: 'نصائح للمطورين'
    };

    const result = await renderCardImage(cardData, {
      outputDir: 'data/test_output',
      filename: 'unit_test_mahmoud_card.png',
    });

    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.absolutePath));
    const stats = fs.statSync(result.absolutePath);
    assert.ok(stats.size > 50000); // Verify it's a substantive PNG image
    assert.equal(result.width, CARD_WIDTH);
    assert.equal(result.height, CARD_HEIGHT);

    // Clean up test file
    try {
      fs.unlinkSync(result.absolutePath);
      fs.rmdirSync(path.dirname(result.absolutePath));
    } catch {}
  });

  it('escapes HTML special characters in card fields', () => {
    const html = generateCardHTML({
      title: 'A < B & C > D',
      highlight: '"quoted"',
      pill: 'DB & Cache',
      steps: ['Step 1: x < y & z > 0', 'Step 2: a < b', 'Step 3: c & d'],
      language: 'en',
    }, DEFAULT_AUTHOR);

    assert.ok(html.includes('A &lt; B &amp; C &gt; D'));
    assert.ok(html.includes('&quot;quoted&quot;'));
    assert.ok(html.includes('DB &amp; Cache'));
    assert.ok(html.includes('Step 1: x &lt; y &amp; z &gt; 0'));
    assert.ok(!html.includes('A < B & C > D'));
    assert.equal(escapeHtml(`'test' & <tag>`), '&#39;test&#39; &amp; &lt;tag&gt;');
  });

  it('renders English cards with LTR direction and Plus Jakarta Sans font', () => {
    const html = generateCardHTML({
      title: 'Why Idempotency Keys Matter in Payments',
      pill: 'Distributed Systems',
      steps: [
        'Store idempotency key with request hash in Redis',
        'Return cached response on duplicate retries',
        'Set TTL longer than client retry window',
      ],
      language: 'en',
    }, DEFAULT_AUTHOR);

    assert.ok(html.includes('<html lang="en" dir="ltr">'));
    assert.ok(html.includes('.progression-spine{right:auto;left:29px}'));
    assert.ok(html.includes("font-family:'Plus Jakarta Sans',sans-serif"));
  });
});

describe('Card Content Generation & Validation (card_content.js)', () => {
  const samplePost = `عند بناء بوابة دفع، تكرار الطلبات بسبب انقطاع الشبكة قد يسبب خصماً مضاعفاً.
الحل يعتمد على Idempotency Key لكل عملية دفع مع حفظ النتيجة في Redis.
تأكد من مقارنة hash الطلب لمنع إعادة استخدام نفس المفتاح ببيانات مختلفة.
اضبط TTL للمفتاح ليغطي نافذة إعادة المحاولة.`;

  it('validateCardContent rejects generic filler, foreign scripts, and ungrounded steps', () => {
    const bad = {
      title: 'موضوع عام',
      highlight: '',
      pill: 'عام',
      steps: [
        'حدد هدفك بوضوح',
        'نصيحة مخترعة لا علاقة لها بالمنشور بتاتاً',
        'Redis يحفظ النتيجة في الذاكرة',
      ],
    };
    const res = validateCardContent(bad, { postText: samplePost, language: 'ar' });
    assert.equal(res.ok, false);
    assert.ok(res.issues.includes('generic filler phrase'));
    assert.ok(res.issues.some((i) => i.includes('not grounded in the post')));

    const foreign = {
      title: 'Title with 中文',
      highlight: '',
      pill: 'Backend',
      steps: ['Redis stores keys', 'Idempotency prevents duplicates', 'TTL expires keys'],
    };
    const foreignRes = validateCardContent(foreign, {
      postText: 'Redis stores keys and Idempotency prevents duplicates with TTL',
      language: 'en',
    });
    assert.equal(foreignRes.ok, false);
    assert.ok(foreignRes.issues.includes('foreign script in card text'));
  });

  it('generateCardContent retries with validation feedback and returns grounded card', async () => {
    let calls = 0;
    const result = await generateCardContent({
      postText: samplePost,
      topic: { title: 'Idempotency Keys in Payment Gateways', keywords: ['Redis', 'Idempotency'] },
      language: 'ar',
      generateText: async (prompt) => {
        calls++;
        if (calls === 1) {
          return JSON.stringify({
            title: 'نصائح عامة',
            highlight: '',
            pill: 'عام',
            steps: ['حدد هدفك', 'خصص وقتاً', 'تعلم من مصادر موثوقة'],
          });
        }
        assert.ok(prompt.includes('Your previous answer had these problems, fix them:'));
        return JSON.stringify({
          title: 'كيف تمنع الخصم المضاعف في بوابات الدفع؟',
          highlight: '',
          pill: 'أنظمة موزعة',
          steps: [
            'استخدم Idempotency Key لكل عملية دفع',
            'احفظ نتيجة العملية في Redis',
            'قارن hash الطلب واضبط TTL مناسب',
          ],
        });
      },
    });

    assert.equal(calls, 2);
    assert.equal(result.language, 'ar');
    assert.equal(result.steps.length, 3);
    assert.equal(result.pill, 'أنظمة موزعة');
  });

  it('generateCardContent falls back to post sentences without generic filler when LLM fails', async () => {
    const result = await generateCardContent({
      postText: samplePost,
      topic: { title: 'Idempotency Keys', keywords: ['Redis'] },
      language: 'ar',
      generateText: async () => {
        throw new Error('LLM unavailable');
      },
    });

    assert.equal(result.title, 'Idempotency Keys');
    assert.equal(result.language, 'ar');
    assert.ok(result.steps.length >= 1);
    assert.ok(!result.steps.some((s) => s.includes('حدد هدفك')));
  });
});
