import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COLOR_THEMES,
  getNextTheme,
  resolveTheme,
  getIconSVG,
  generateCardHTML,
  extractCardContent,
  renderCardImage,
  DEFAULT_AUTHOR,
} from '../scripts/card_generator.js';

describe('Card Generator - Color Themes & Brand Identity', () => {
  it('contains at least 6 vibrant modern developer color themes', () => {
    assert.ok(COLOR_THEMES.length >= 6);
    const themeIds = COLOR_THEMES.map((t) => t.id);
    assert.ok(themeIds.includes('emerald'));
    assert.ok(themeIds.includes('violet'));
    assert.ok(themeIds.includes('sapphire'));
    assert.ok(themeIds.includes('amber'));
  });

  it('getNextTheme cycles sequentially through themes', () => {
    const tempStateFile = path.resolve(process.cwd(), 'data', 'temp_theme_test.json');
    if (fs.existsSync(tempStateFile)) fs.unlinkSync(tempStateFile);

    const theme1 = getNextTheme(tempStateFile);
    const theme2 = getNextTheme(tempStateFile);
    const theme3 = getNextTheme(tempStateFile);

    assert.notEqual(theme1.id, theme2.id);
    assert.notEqual(theme2.id, theme3.id);

    if (fs.existsSync(tempStateFile)) fs.unlinkSync(tempStateFile);
  });

  it('resolveTheme returns requested theme or next sequential theme', () => {
    const emerald = resolveTheme('emerald');
    assert.equal(emerald.id, 'emerald');

    const violet = resolveTheme('violet');
    assert.equal(violet.id, 'violet');

    const fallback = resolveTheme('non-existent-theme-xyz');
    assert.ok(fallback && fallback.id);
  });

  it('generates HTML containing Mahmoud H. Almodalal, Full-Stack Developer, and avatar image', () => {
    const cardData = {
      title: 'كيف تبني معمارية ويب عالية الكفاءة؟',
      bullets: ['نصيحة أولى في الأداء', 'نصيحة ثانية في الكاش', 'نصيحة ثالثة في القواعد'],
      tag1: 'نصائح للمطورين',
      tag2: 'قائمة تحقق',
      icon: 'target',
    };

    const html = generateCardHTML(cardData, COLOR_THEMES[0], DEFAULT_AUTHOR);

    assert.ok(html.includes('Mahmoud H. Almodalal'));
    assert.ok(html.includes('Full-Stack Developer'));
    assert.ok(html.includes('كيف تبني معمارية ويب عالية الكفاءة؟'));
    assert.ok(html.includes('data:image/'));
    assert.ok(html.includes('1080px'));
    assert.ok(html.includes('1350px'));
  });

  it('extractCardContent extracts question hook and key bullets', () => {
    const samplePost = `💡 معضلة معمارية: كيف تضمن استجابة بحث جغرافي أقل من 12ms؟
    
تفاصيل حول الأنظمة وقواعد البيانات...

📌 نصائح للمهندسين:
• اعتمد على إضافة PostGIS مع نوع البيانات GEOMETRY
• أنشئ فهرس GIST R-tree لتقليل تعقيد البحث
• استخدم ST_DWithin وتجنب حساب مسافات Haversine برمجياً

💬 سؤال للمهندسين؟`;

    const extracted = extractCardContent(samplePost, {
      keywords: ['postgis', 'postgres', 'spatial'],
      category: 'geospatial-database',
    });

    assert.ok(extracted.title.includes('استجابة بحث جغرافي'));
    assert.equal(extracted.bullets.length, 3);
    assert.ok(extracted.bullets[0].includes('PostGIS'));
    assert.equal(extracted.icon, 'database');
    assert.ok(extracted.tag2.includes('PostgreSQL'));
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
    assert.equal(extracted.bullets.length, 3);
    assert.ok(extracted.bullets[0].includes('lockForUpdate'));
    assert.ok(extracted.bullets[1].includes('decrement'));
    assert.ok(extracted.bullets[2].includes('الواجهة'));
    assert.equal(extracted.icon, 'database');
  });

  it('renderCardImage generates valid 1080x1350 PNG file via headless Chrome', async () => {
    const cardData = {
      title: 'كيف تتعلم تقنيات جديدة وأنت مشغول بالعمل كمهندس برمجيات؟',
      bullets: [
        'خصص وقتاً ثابتاً ومقدساً كل يوم',
        'طبّق ما تتعلمه فوراً بمشروع جانبي صغير',
        'ركز على تقنية واحدة في كل مرة'
      ],
      tag1: 'نصائح للمطورين',
      tag2: 'قائمة تحقق',
      icon: 'target'
    };

    const result = await renderCardImage(cardData, {
      theme: 'emerald',
      outputDir: 'data/test_output',
      filename: 'unit_test_card.png',
    });

    assert.equal(result.success, true);
    assert.ok(fs.existsSync(result.absolutePath));
    const stats = fs.statSync(result.absolutePath);
    assert.ok(stats.size > 50000); // Verify it's a substantive PNG image

    // Clean up test file
    try {
      fs.unlinkSync(result.absolutePath);
      fs.rmdirSync(path.dirname(result.absolutePath));
    } catch {}
  });
});
