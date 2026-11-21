import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDraftQuality, countWords, generateWithGate } from '../scripts/quality_gate.js';

describe('quality gate checks', () => {
  it('counts words accurately across mixed Arabic and English technical terms', () => {
    const text = 'تفريغ الـ RTSP stream داخل asyncio.Queue غير محدودة يسبب OOM';
    const count = countWords(text);
    assert.equal(count, 11);
  });

  it('rejects drafts containing banned AI clichés', () => {
    const text = `
تفريغ الـ RTSP stream داخل queue يسبب مشاكل بالغة.
في أحد مشاريعنا واجهنا هذا الاختناق المعماري الصعب.
الحل كان تقليل حجم الذاكرة.
الخلاصة: اضبط الحجم.
شاركونا في التعليقات 👇
#SystemDesign #Architecture #Backend #DistributedSystems
    `.trim();

    const result = checkDraftQuality(text);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some((i) => i.includes('في أحد مشاريعنا')));
    assert.ok(result.issues.some((i) => i.includes('الخلاصة:')));
    assert.ok(result.issues.some((i) => i.includes('👇')));
  });

  it('rejects robotic section bracket headers', () => {
    const text = `
[1. The Hook]
خطأ معماري فادح في معالجة البيانات الموزعة.
[2. The Real Friction]
الذاكرة تنفد بسبب تراكم الأحداث.
[3. The Engineering Trade-off]
استخدمنا Drop-oldest frame.
[4. The Takeaway]
القاعدة واضحة.
#SystemDesign #DistributedSystems #SoftwareArchitecture #Backend
    `.trim();

    const result = checkDraftQuality(text);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some((i) => i.includes('robotic section brackets')));
  });

  it('passes a well-formed Staff Architect post within bounds', () => {
    const validPost = `
تفريغ الـ RTSP stream داخل asyncio.Queue غير محدودة هو أسرع طريق للوصول إلى Out-of-Memory (OOM) في مسارات الفيديو المباشر.

الوهم المعماري الشائع هو الاعتماد على Concurrency عالية لابتلاع تأخير المعالجة. الواقع أن سرعة الـ Producer (الكاميرات بمعدل 30 FPS) تفوق دائماً زمن استدلال نماذج الـ Computer Vision مثل YOLO على الـ GPU. عند حدوث أي Micro-stutter، تبدأ الـ Frames في التراكم داخل الذاكرة، ويتضخم الـ Buffer، وترتفع P95 Latency من 50ms إلى ثوانٍ، لتنهار العملية بالكامل.

الحل الهندسي ليس زيادة الذاكرة، بل التضحية الصريحة بالاكتمال لصالح الزمن الفعلي عبر Leaky Ring-Buffer بحجم صارم (maxsize=1) واستراتيجية Drop-oldest frame. خسرنا تحليل كل إطار تاريخي، لكننا ضمنا بقاء خط المعالجة في حدود Real-Time وثبات استهلاك الذاكرة.

القاعدة الذهبية: في أنظمة البث المباشر، الإطار المتأخر ليس بطيئاً، بل هو بيانات تالفة يجب إسقاطها فوراً.

كيف توازنون في أنظمتكم بين الحفاظ على تسلسل الـ State وتفادي الـ Backpressure عند حدوث الاختناقات؟

#SystemDesign #DistributedSystems #ComputerVision #Python #SoftwareArchitecture
    `.trim();

    const result = checkDraftQuality(validPost);
    assert.equal(result.passed, true);
    assert.deepEqual(result.issues, []);
  });

  it('generateWithGate retries until passing or exhausts attempts', async () => {
    let callCount = 0;
    const produce = async () => {
      callCount += 1;
      if (callCount < 2) {
        return { text: 'قصير جداً #test #code #dev' };
      }
      return {
        text: `
تفريغ الـ RTSP stream داخل asyncio.Queue غير محدودة هو أسرع طريق للوصول إلى Out-of-Memory (OOM) في مسارات الفيديو المباشر.

الوهم المعماري الشائع هو الاعتماد على Concurrency عالية لابتلاع تأخير المعالجة. الواقع أن سرعة الـ Producer (الكاميرات بمعدل 30 FPS) تفوق دائماً زمن استدلال نماذج الـ Computer Vision مثل YOLO على الـ GPU. عند حدوث أي Micro-stutter، تبدأ الـ Frames في التراكم داخل الذاكرة، ويتضخم الـ Buffer، وترتفع P95 Latency من 50ms إلى ثوانٍ، لتنهار العملية بالكامل.

الحل الهندسي ليس زيادة الذاكرة، بل التضحية الصريحة بالاكتمال لصالح الزمن الفعلي عبر Leaky Ring-Buffer بحجم صارم (maxsize=1) واستراتيجية Drop-oldest frame. خسرنا تحليل كل إطار تاريخي، لكننا ضمنا بقاء خط المعالجة في حدود Real-Time وثبات استهلاك الذاكرة.

القاعدة الذهبية: في أنظمة البث المباشر، الإطار المتأخر ليس بطيئاً، بل هو بيانات تالفة يجب إسقاطها فوراً.

كيف توازنون في أنظمتكم بين الحفاظ على تسلسل الـ State وتفادي الـ Backpressure عند حدوث الاختناقات؟

#SystemDesign #DistributedSystems #ComputerVision #Python #SoftwareArchitecture
        `.trim(),
      };
    };

    const { draft, gate } = await generateWithGate(produce, { maxAttempts: 3 });
    assert.equal(gate.passed, true);
    assert.equal(gate.attempts, 2);
    assert.ok(draft.text.includes('RTSP stream'));
  });
});
