import fs from 'node:fs';
import path from 'node:path';
import { resolveDataPath } from './path_resolver.js';

/**
 * Strategic angles that change the narrative lens of every generated post,
 * so the same project/topic never produces the same text twice.
 */
export const STRATEGIC_ANGLES = [
  {
    id: 'first-principles',
    labelAr: 'المبادئ الأولى',
    directiveAr: 'ابدأ المنشور بسؤال أولي يُعيد صياغة المشكلة من جذورها التقنية، ولا تعتمد على المفاهيم المعتادة.',
    hookStyle: 'سؤال استنكاري تعيد فيه صياغة المعضلة كما لم يرها أحد من قبل.',
  },
  {
    id: 'production-incident',
    labelAr: 'حادثة إنتاج حقيقية',
    directiveAr: 'ابنِ السرد حول حادثة إنتاجية واقعية مررت بها، واذكر المؤشر المرئي (P95، معدل错误، التأخير) الذي كشفت المشكلة.',
    hookStyle: 'تصريح جريءcounter-intuitive عن خطأ شائع يعتقده معظم المهندسين.',
  },
  {
    id: 'trade-off-analysis',
    labelAr: 'تحليل المقايضة',
    directiveAr: 'قارن بين حلين Arquitecturaisين متضادين (مثل متغير واحد على حساب آخر)، ووضح لماذا اخترت أحدهما في هذا المشروع تحديداً.',
    hookStyle: 'إعلان عن تنازل مقصود بين خيارين تقنيين، وكلاهما له ثمن.',
  },
  {
    id: 'lesson-learned',
    labelAr: 'درس مستفاد',
    directiveAr: 'ابنِ المنشور حول خطأ تقني ارتكبه فريقك أو أنت شخصياً، وكيف تم تصحيحه ومنع تكراره.',
    hookStyle: 'اعتراف تقني صريح بموقف لم يسير كما هو مخطط له.',
  },
  {
    id: 'architectural-dilemma',
    labelAr: 'معضلة معمارية',
    directiveAr: 'قدم معضلة معمارية ليس لها حل مثالي، ووضح التوتر بين المتطلبات المتضاربة (مثل التوافر مقابل الاتساق).',
    hookStyle: 'معضلة غير محلولة تواجه أي مهندس أنظمة عند التوسع.',
  },
  {
    id: 'metric-driven',
    labelAr: 'موجه بالمقاييس',
    directiveAr: 'ابدأ بالرقم الإنتاجي الحقيقي (مثل P95 340ms → 11.4ms)، ثم اشرح كيف تم الوصول إليه.',
    hookStyle: 'رقم صادم أو تحسن ملحوظ يجعل القارئ يتساءل كيف حدث.',
  },
  {
    id: 'anti-pattern',
    labelAr: 'أنماط معاكسة',
    directiveAr: 'اذكر نمطاً شائعاً يعتقد المهندسون أنه صحيح، ثم وضح لماذا هو خاطئ في سياق هذا المشروع، وما هو البديل.',
    hookStyle: 'تصريح بأن ممارسة شائعة في الصناعة هي في الواقع مضرة.',
  },
];

/**
 * Hook templates by style, ensuring a fresh opening every generation.
 */
export const HOOK_TEMPLATES = [
  'غالباً ما نفترض أن X، ولكن الواقع التقني يقول العكس.',
  'المشكلة لا تكمن في الأداة، بل في كيف نستخدمها.',
  'الأنظمة الموزعة تُظهر أسوأ مخاوفها تحت الضغط، ليس في المختبر.',
  'ما يبدو حلاً مؤقتاً يتحول إلى دين تقني دائم خلال أسابيع.',
  'كلฐาน بيانات يُباع على أنه موحد يسلك سلوكاً مختلفاً تحت التزامن.',
];

const TEXT_INNOVATION_STATE_FILE = resolveDataPath('text_innovation_state.json');

function readInnovationState(stateFile) {
  try {
    const resolved = resolveDataPath(stateFile);
    if (fs.existsSync(resolved)) {
      const state = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      if (state && typeof state === 'object') return state;
    }
  } catch {}
  return {};
}

function writeInnovationState(stateFile, state) {
  try {
    const resolved = resolveDataPath(stateFile);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore state write errors
  }
}

/**
 * Single atomic call to get the next innovation tuple (angle, hook, length)
 * while keeping all indices safely persisted without overwriting each other.
 */
export function getNextInnovation(stateFile = TEXT_INNOVATION_STATE_FILE) {
  const state = readInnovationState(stateFile);

  let angleIndex = 0;
  if (typeof state.angleIndex === 'number') {
    angleIndex = (state.angleIndex + 1) % STRATEGIC_ANGLES.length;
  } else if (typeof state.lastIndex === 'number') {
    angleIndex = (state.lastIndex + 1) % STRATEGIC_ANGLES.length;
  }

  let hookIndex = 0;
  if (typeof state.hookIndex === 'number') {
    hookIndex = (state.hookIndex + 1) % HOOK_TEMPLATES.length;
  } else if (typeof state.lastHookIndex === 'number') {
    hookIndex = (state.lastHookIndex + 1) % HOOK_TEMPLATES.length;
  }

  let lengthIndex = 0;
  if (typeof state.lengthIndex === 'number') {
    lengthIndex = (state.lengthIndex + 1) % TEXT_LENGTH_VARIANTS.length;
  }

  const newState = {
    ...state,
    angleIndex,
    hookIndex,
    lengthIndex,
    angleId: STRATEGIC_ANGLES[angleIndex].id,
    lastIndex: angleIndex,
    lastHookIndex: hookIndex,
  };

  writeInnovationState(stateFile, newState);

  return {
    angle: STRATEGIC_ANGLES[angleIndex],
    hook: HOOK_TEMPLATES[hookIndex],
    length: TEXT_LENGTH_VARIANTS[lengthIndex],
    angleIndex,
    hookIndex,
    lengthIndex,
  };
}

export function getNextStrategicAngleIndex(stateFile = TEXT_INNOVATION_STATE_FILE) {
  const state = readInnovationState(stateFile);
  let currentIndex = 0;
  if (typeof state.angleIndex === 'number') {
    currentIndex = (state.angleIndex + 1) % STRATEGIC_ANGLES.length;
  } else if (typeof state.lastIndex === 'number') {
    currentIndex = (state.lastIndex + 1) % STRATEGIC_ANGLES.length;
  }

  state.angleIndex = currentIndex;
  state.lastIndex = currentIndex;
  state.angleId = STRATEGIC_ANGLES[currentIndex].id;
  writeInnovationState(stateFile, state);

  return currentIndex;
}

export function resolveStrategicAngle(index) {
  if (typeof index !== 'number' || index < 0 || index >= STRATEGIC_ANGLES.length) {
    index = getNextStrategicAngleIndex();
  }
  return STRATEGIC_ANGLES[index];
}

export function getNextHookTemplateIndex(stateFile = TEXT_INNOVATION_STATE_FILE) {
  const state = readInnovationState(stateFile);
  let currentIndex = 0;
  if (typeof state.hookIndex === 'number') {
    currentIndex = (state.hookIndex + 1) % HOOK_TEMPLATES.length;
  } else if (typeof state.lastHookIndex === 'number') {
    currentIndex = (state.lastHookIndex + 1) % HOOK_TEMPLATES.length;
  }

  state.hookIndex = currentIndex;
  state.lastHookIndex = currentIndex;
  writeInnovationState(stateFile, state);

  return currentIndex;
}

export function resolveHookTemplate(index) {
  if (typeof index !== 'number' || index < 0 || index >= HOOK_TEMPLATES.length) {
    index = getNextHookTemplateIndex();
  }
  return HOOK_TEMPLATES[index];
}

export const TEXT_LENGTH_VARIANTS = [
  { id: 'concise', labelAr: 'مختصر', paragraphs: 4, detailLevel: 'موجز مع التركيز على الخلاصة فقط' },
  { id: 'balanced', labelAr: 'متوازن', paragraphs: 6, detailLevel: 'تفصيل معتدل للميكانيكية التقنية' },
  { id: 'deep-dive', labelAr: 'غوص عميق', paragraphs: 8, detailLevel: 'تفصيل تقني كامل مع ذكر القياسات والاختبارات' },
];

const TEXT_LENGTH_STATE_FILE = resolveDataPath('text_length_state.json');

export function getNextTextLengthVariantIndex(stateFile = TEXT_LENGTH_STATE_FILE) {
  const state = readInnovationState(stateFile);
  let currentIndex = 0;
  if (typeof state.lengthIndex === 'number') {
    currentIndex = (state.lengthIndex + 1) % TEXT_LENGTH_VARIANTS.length;
  } else if (typeof state.lastIndex === 'number') {
    currentIndex = (state.lastIndex + 1) % TEXT_LENGTH_VARIANTS.length;
  }

  state.lengthIndex = currentIndex;
  state.lastIndex = currentIndex;
  writeInnovationState(stateFile, state);

  return currentIndex;
}

export function resolveTextLengthVariant(index) {
  if (typeof index !== 'number' || index < 0 || index >= TEXT_LENGTH_VARIANTS.length) {
    index = getNextTextLengthVariantIndex();
  }
  return TEXT_LENGTH_VARIANTS[index];
}
