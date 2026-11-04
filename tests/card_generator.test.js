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
});
