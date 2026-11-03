import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_KB_DIR = path.resolve(process.cwd(), 'data', 'rag', 'knowledge_base');
export const DEFAULT_CHALLENGES_PATH = path.resolve(process.cwd(), 'data', 'rag', 'challenges_matrix.json');
export const DEFAULT_STYLE_GUIDE_PATH = path.resolve(process.cwd(), 'data', 'rag', 'author_style_guide.md');
export const DEFAULT_RAG_STATE_PATH = path.resolve(process.cwd(), 'data', 'rag', 'rag_state.json');
export const DEFAULT_EMBEDDING_CACHE_PATH = path.resolve(process.cwd(), 'data', 'rag', 'embedding_cache.json');
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';

const QUERY_EMBEDDING_CACHE = new Map();
const MAX_QUERY_EMBEDDING_CACHE_ENTRIES = 100;

const EASTERN_DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

/**
 * Normalizes Arabic text by stripping diacritics, folding alef/yaa/taa-marbuta forms,
 * and converting Eastern numerals to standard ASCII digits.
 * Exactly mirrors Mahmoud's clientMORE production normalization pipeline.
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u064B-\u0652]/g, '') // Strip diacritics (tashkeel)
    .replace(/[إأآا]/g, 'ا')         // Fold alef variations
    .replace(/[يى]/g, 'ي')           // Fold yaa variations
    .replace(/ة/g, 'ه')             // Fold taa marbuta
    .replace(/[٠-٩]/g, (d) => EASTERN_DIGIT_MAP[d] || d)
    .toLowerCase()
    .trim();
}

/**
 * Tokenizes text for BM25 search, handling bilingual Arabic & English tokens.
 */
export function tokenize(text) {
  const normalized = normalizeArabic(text);
  // Match Arabic words, English words, numbers, and technical tokens with hyphens/dots
  const matches = normalized.match(/[\p{L}\p{N}._-]+/gu) || [];
  return matches.map((t) => t.toLowerCase());
}

/**
 * In-memory BM25 index implementation for pure-Node.js lexical retrieval.
 */
export class BM25Index {
  constructor(docs = [], { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = docs;
    this.docCount = docs.length;
    this.docLengths = [];
    this.avgDocLength = 0;
    this.docFreqs = new Map(); // term -> count of docs containing term
    this.termFreqs = [];       // docIndex -> Map(term -> count)

    this._buildIndex();
  }

  _buildIndex() {
    let totalLength = 0;
    for (let i = 0; i < this.docs.length; i++) {
      const tokens = tokenize(this.docs[i].text);
      this.docLengths[i] = tokens.length;
      totalLength += tokens.length;

      const tf = new Map();
      const seen = new Set();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
        if (!seen.has(token)) {
          seen.add(token);
          this.docFreqs.set(token, (this.docFreqs.get(token) || 0) + 1);
        }
      }
      this.termFreqs[i] = tf;
    }
    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;
  }

  search(query, { topK = 5 } = {}) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.docCount === 0) return [];

    const scores = new Array(this.docCount).fill(0);

    for (const token of queryTokens) {
      const df = this.docFreqs.get(token) || 0;
      if (df === 0) continue;

      // Robertson-Sparck Jones IDF formula
      const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));

      for (let i = 0; i < this.docCount; i++) {
        const tf = this.termFreqs[i].get(token) || 0;
        if (tf === 0) continue;

        const docLen = this.docLengths[i];
        const denom = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        const score = idf * ((tf * (this.k1 + 1)) / denom);
        scores[i] += score;
      }
    }

    const results = [];
    for (let i = 0; i < this.docCount; i++) {
      if (scores[i] > 0) {
        results.push({
          doc: this.docs[i],
          score: scores[i],
          index: i,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

/**
 * Loads and parses markdown dossiers from knowledge_base/projects into searchable chunks.
 */
export function loadProjectChunks(kbDir = DEFAULT_KB_DIR) {
  const projectsDir = path.join(kbDir, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.md'));
  const chunks = [];

  for (const file of files) {
    const fullPath = path.join(projectsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const slug = path.basename(file, '.md');

    // Split document by sections
    const sections = content.split(/\n(?=## )/g);
    for (let idx = 0; idx < sections.length; idx++) {
      const sectionText = sections[idx].trim();
      if (!sectionText) continue;

      const titleMatch = sectionText.match(/^## (.*)/m);
      const title = titleMatch ? titleMatch[1].trim() : `${slug} Overview`;

      chunks.push({
        id: `${slug}-section-${idx}`,
        project: slug,
        title,
        text: sectionText,
        sourceFile: file,
      });
    }
  }

  return chunks;
}

/**
 * Loads the structured challenges matrix.
 */
export function loadChallengesMatrix(filePath = DEFAULT_CHALLENGES_PATH) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse challenges matrix:', err.message);
    return [];
  }
}

/**
 * Loads the author style guide.
 */
export function loadAuthorStyleGuide(filePath = DEFAULT_STYLE_GUIDE_PATH) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Loads or initializes RAG state tracker (tracks challenge cycling index).
 */
export function loadRAGState(filePath = DEFAULT_RAG_STATE_PATH) {
  if (!fs.existsSync(filePath)) {
    return { lastChallengeId: 0, cycleCount: 1, lastGeneratedAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { lastChallengeId: 0, cycleCount: 1, lastGeneratedAt: null };
  }
}

/**
 * Saves RAG state tracker.
 */
export function saveRAGState(state, filePath = DEFAULT_RAG_STATE_PATH) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/**
 * Gets next sequential challenge from the matrix, automatically cycling back when completed.
 */
export function getNextChallenge({
  challengesPath = DEFAULT_CHALLENGES_PATH,
  statePath = DEFAULT_RAG_STATE_PATH,
} = {}) {
  const challenges = loadChallengesMatrix(challengesPath);
  if (challenges.length === 0) {
    throw new Error('Challenges matrix is empty');
  }

  const state = loadRAGState(statePath);
  let nextIdx = 0;

  if (state.lastChallengeId) {
    const currentIdx = challenges.findIndex((c) => c.id === state.lastChallengeId);
    if (currentIdx !== -1) {
      nextIdx = (currentIdx + 1) % challenges.length;
    }
  }

  const selected = challenges[nextIdx];
  state.lastChallengeId = selected.id;
  state.lastGeneratedAt = new Date().toISOString();
  if (nextIdx === 0 && state.lastChallengeId) {
    state.cycleCount = (state.cycleCount || 1) + 1;
  }
  saveRAGState(state, statePath);

  return selected;
}

/**
 * Computes cosine similarity between two float vectors.
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Creates a stable cache key that invalidates automatically when either the
 * embedding model or the source text changes.
 */
export function getEmbeddingCacheKey(text, model = DEFAULT_EMBEDDING_MODEL) {
  return crypto
    .createHash('sha256')
    .update(`${model}\n${String(text || '')}`)
    .digest('hex');
}

/**
 * Loads the persistent document embedding cache. Corrupt or incompatible
 * cache files are ignored so BM25 retrieval remains available.
 */
export function loadEmbeddingCache(cachePath = DEFAULT_EMBEDDING_CACHE_PATH) {
  try {
    if (!fs.existsSync(cachePath)) return { version: 1, entries: {} };
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (parsed?.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

/**
 * Writes the embedding cache atomically to avoid corrupting it on interruption.
 */
export function saveEmbeddingCache(cache, cachePath = DEFAULT_EMBEDDING_CACHE_PATH) {
  const directory = path.dirname(cachePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${cachePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(cache)}\n`, 'utf8');
  fs.renameSync(temporaryPath, cachePath);
}

async function embedText(text, geminiClient, model) {
  const response = await geminiClient.models.embedContent({
    model,
    contents: text,
  });
  return response?.embedding?.values || null;
}

async function mapWithConcurrency(items, worker, concurrency = 4) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

/**
 * Reciprocal Rank Fusion (RRF) combining dense and lexical rankings.
 */
export function reciprocalRankFusion(lexicalHits = [], denseHits = [], { rrfK = 60, topK = 4 } = {}) {
  const fusedScores = new Map();
  const docMap = new Map();

  lexicalHits.forEach((hit, rank) => {
    const docId = hit.doc.id;
    docMap.set(docId, hit.doc);
    const score = 1.0 / (rrfK + rank + 1);
    fusedScores.set(docId, (fusedScores.get(docId) || 0) + score);
  });

  denseHits.forEach((hit, rank) => {
    const docId = hit.doc.id;
    docMap.set(docId, hit.doc);
    const score = 1.0 / (rrfK + rank + 1);
    fusedScores.set(docId, (fusedScores.get(docId) || 0) + score);
  });

  const sorted = Array.from(fusedScores.entries())
    .map(([id, rrfScore]) => ({
      doc: docMap.get(id),
      rrfScore,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore);

  return sorted.slice(0, topK);
}

/**
 * Main RAG retrieval method: Hybrid Search across portfolio knowledge base & challenge matrix.
 */
export async function retrieveProjectContext(query, options = {}) {
  const {
    kbDir = DEFAULT_KB_DIR,
    challengesPath = DEFAULT_CHALLENGES_PATH,
    topK = 3,
    geminiClient = null,
    embeddingModel = DEFAULT_EMBEDDING_MODEL,
    embeddingCachePath = DEFAULT_EMBEDDING_CACHE_PATH,
    embeddingConcurrency = 4,
  } = options;

  const chunks = loadProjectChunks(kbDir);
  const challenges = loadChallengesMatrix(challengesPath);

  // Convert challenges to searchable docs
  const challengeDocs = challenges.map((c) => ({
    id: `challenge-${c.id}`,
    project: c.project,
    title: c.title,
    text: `Project: ${c.project_name}. Challenge: ${c.title}. Dilemma: ${c.dilemma}. Solution: ${c.solution}. Metrics: ${c.metrics}. Trade-off: ${c.tradeoff}. Keywords: ${c.keywords.join(' ')}`,
    isChallenge: true,
    rawChallenge: c,
  }));

  const searchableDocs = [...chunks, ...challengeDocs];
  if (searchableDocs.length === 0) {
    return {
      query,
      challenge: null,
      retrievedDocs: [],
      matchedProject: null,
    };
  }

  // 1. Lexical BM25 Search
  const bm25 = new BM25Index(searchableDocs);
  const lexicalHits = bm25.search(query, { topK: topK * 3 });

  // 2. Optional Dense Embedding Search (if geminiClient provided)
  let denseHits = [];
  if (geminiClient && typeof geminiClient.models?.embedContent === 'function') {
    try {
      const queryKey = getEmbeddingCacheKey(query, embeddingModel);
      let queryVec = QUERY_EMBEDDING_CACHE.get(queryKey);
      if (!queryVec) {
        queryVec = await embedText(query, geminiClient, embeddingModel);
        if (queryVec) {
          QUERY_EMBEDDING_CACHE.set(queryKey, queryVec);
          while (QUERY_EMBEDDING_CACHE.size > MAX_QUERY_EMBEDDING_CACHE_ENTRIES) {
            QUERY_EMBEDDING_CACHE.delete(QUERY_EMBEDDING_CACHE.keys().next().value);
          }
        }
      }

      if (queryVec) {
        const embeddingCache = loadEmbeddingCache(embeddingCachePath);
        const candidates = lexicalHits.length > 0 ? lexicalHits.map((h) => h.doc) : searchableDocs.slice(0, 15);
        const scoredCandidates = await mapWithConcurrency(candidates, async (doc) => {
          const text = doc.text.slice(0, 1000);
          const cacheKey = getEmbeddingCacheKey(text, embeddingModel);
          const cached = embeddingCache.entries[cacheKey];
          const docVec = cached?.model === embeddingModel && Array.isArray(cached.values)
            ? cached.values
            : await embedText(text, geminiClient, embeddingModel);

          if (!docVec) return null;

          if (!cached) {
            embeddingCache.entries[cacheKey] = {
              docId: doc.id,
              model: embeddingModel,
              values: docVec,
              updatedAt: new Date().toISOString(),
            };
          }

          return {
            doc,
            score: cosineSimilarity(queryVec, docVec),
          };
        }, embeddingConcurrency);

        saveEmbeddingCache(embeddingCache, embeddingCachePath);
        denseHits = scoredCandidates
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);
      }
    } catch (embErr) {
      // Fallback gracefully to BM25
      console.warn(`[RAG Embedding Fallback] ${embErr.message}`);
    }
  }

  // 3. Fusion
  const finalHits = reciprocalRankFusion(lexicalHits, denseHits, { topK });

  // Identify best matching challenge card and project
  let matchedChallenge = null;
  let matchedProject = null;

  for (const hit of finalHits) {
    if (hit.doc.rawChallenge && !matchedChallenge) {
      matchedChallenge = hit.doc.rawChallenge;
    }
    if (!matchedProject && hit.doc.project) {
      matchedProject = hit.doc.project;
    }
  }

  // If no challenge card was directly retrieved, find one associated with the matched project
  if (!matchedChallenge && matchedProject) {
    matchedChallenge = challenges.find((c) => c.project === matchedProject) || null;
  }

  return {
    query,
    challenge: matchedChallenge,
    retrievedDocs: finalHits.map((h) => h.doc),
    matchedProject: matchedProject || matchedChallenge?.project || 'portfolio',
  };
}

/**
 * Builds the comprehensive grounded prompt for Gemini incorporating:
 * 1. Mahmoud's personal engineering identity
 * 2. Grounded project facts, exact production metrics, and architecture trade-offs
 * 3. Author style guide and 5-element breakdown rules
 */
export function buildGroundedRAGPrompt({
  query = '',
  challenge = null,
  retrievedDocs = [],
  styleGuide = '',
  isEnglish = false,
  situation = '',
} = {}) {
  const languageDirective = isEnglish
    ? 'Language: English. Write in authoritative, crisp, battle-tested engineering English.'
    : `Language: Arabic only, written in polished Modern Standard Arabic with a natural Palestinian/Saudi technical voice.
English is allowed ONLY for established technical names, APIs, database operators, framework names, metrics, and hashtags (for example: PostgreSQL, PostGIS, GiST index, ST_DWithin, Haversine, P95 latency, CPU throttling, Django, Redis, Celery, Race Condition, Idempotency).
Do not insert random English words or any other language. Never output words such as "enabled", "problem", "cause", or "solution" inside Arabic sentences. Do not use Chinese, Turkish, or machine-translated fragments. Do not translate or transliterate established technical names awkwardly.`;

  const hookExample = isEnglish
    ? 'A database transaction is not a lock.'
    : 'استخدام DB::transaction وحده لا يحمي تطبيقك من الـ Race Conditions إذا لم تقفل السجلات أثناء القراءة.';
  const ruleExample = isEnglish
    ? 'Engineering rule: protect correctness at the database boundary, not only in the UI.'
    : 'الدرس الهندسي: لا تعتمد على حماية الواجهة لمنع تكرار العمليات الحساسة، وقاعدة البيانات هي خط الدفاع الحقيقي الوحيد.';
  const ctaLine = isEnglish ? 'Share your approach in the comments.' : 'اكتبوا لنا في التعليقات 👇';
  const rootCauseExample = isEnglish ? 'state the root cause clearly' : 'اذكر السبب الجذري بوضوح';
  const qualityCheck = isEnglish ? 'the English is coherent' : 'the Arabic is coherent';

  const contextSnippets = retrievedDocs
    .map((doc, idx) => `[Fact Source ${idx + 1}: ${doc.title || doc.project}]\n${doc.text}`)
    .join('\n\n---\n\n');

  const challengeInfo = challenge
    ? `
Featured Project: ${challenge.project_name} (${challenge.project})
Architectural Dilemma: ${challenge.dilemma}
Solution & Mechanics: ${challenge.solution}
Exact Production Metrics: ${challenge.metrics}
Chosen vs Rejected Trade-off: ${challenge.tradeoff}
`
    : 'Featured System: Core Portfolio Architectural Case Study';

  const situationSection = situation && situation.trim()
    ? `
=== FEATURED REAL PRODUCTION SCENARIO (FROM AUTHOR) ===
The author specifically provided this real-world production incident / situation:
"""
${situation.trim()}
"""

MANDATORY FOCUS:
Transform the real-world scenario/incident described above into the primary focus of this post. Break down the production root cause, the concurrency/architecture breakdown, and how it was resolved in production. Write in Mahmoud's first-person engineering voice.
`
    : '';

  return `You are Mahmoud H. Almodalal (محمود هشام المدلل), Computer Engineer, Backend Developer, and Technical Manager at Washer (Saudi Arabia) & Teaching Assistant at Islamic University of Gaza.

You are writing an authoritative, high-signal technical LinkedIn post grounded in your real-world production engineering experience, real metrics, and specific project decisions.

${languageDirective}
${situationSection}
=== REAL PROJECT GROUNDING CONTEXT (DO NOT INVENT FAKE DATA) ===
${challengeInfo}

Additional Architectural Documentation:
${contextSnippets || 'Refer to primary engineering specifications and trade-offs.'}

=== AUTHOR IDENTITY & STYLE RULES ===
1. You write from first-person authority as a hands-on builder and leader ("في أحد مشاريعنا...", "قمت بكتابة اختبار آلي...").
2. Focus on REAL production failure modes, concurrency clashes, database bottlenecks, and architectural trade-offs—never generic fluff or textbook theory.
3. Use only facts present in the grounding context. Never invent metrics, project details, tests, locations, or outcomes. Preserve exact numbers and names when provided. For this project, write “GiST spatial index”; never write “GIST R-tree”.
4. STRICT FORMATTING RULE: Absolutely NEVER output section numbers, brackets, markdown headers or labels like "[1. The Hook]" or "### Root Cause". The output MUST be a seamless, beautifully spaced LinkedIn engineering post with double line-breaks between short paragraphs.

Structure your post strictly according to this natural engineering narrative:

1. [The Hook - Architectural Dilemma]:
Start immediately on line 1 with a bold, punchy, counter-intuitive architectural dilemma or technical statement (e.g., "${hookExample}"). No greeting, no fluff, no brackets.

2. [Real Project Context & Incident]:
Describe the real project (${challenge?.project_name || 'the system'}) and the subtle production issue / failure mode that emerged under concurrency or scale (e.g. negative balances on concurrent requests, duplicate voucher redemption, or latency spikes).

3. [Initial Hypothesis & Automated Testing]:
Mention the initial suspicion/hypothesis (e.g. frontend double-click or queue worker issue), then explain that you wrote an automated test simulating concurrent requests to isolate and prove the race condition / bottleneck.

4. [Root Cause Analysis & Technical Mechanics]:
Explain the exact root cause under the hood with technical depth and ${rootCauseExample}.

5. [Actionable Concrete Solution]:
Present the direct solution in 2 numbered steps (1. and 2.) featuring exact framework/database mechanisms (e.g. Pessimistic Locking with lockForUpdate / SELECT FOR UPDATE, and direct atomic DB operations like decrement).

6. [The Trade-Off & Verification]:
Confirm that re-running the automated test proved zero race conditions and total data protection. Contrast the chosen approach with the rejected alternatives (${challenge?.tradeoff || 'Chosen vs Rejected'}) and cite the real production metric (${challenge?.metrics || 'zero anomalies'}).

7. [Key Takeaways - Battle-Tested Engineering Rules]:
Provide exactly one powerful, memorable golden rule (e.g. "${ruleExample}").

8. [Call to Action - Peer Question]:
An engaging technical question directed at fellow software architects, backend leads, and senior engineers, followed by:
"${ctaLine}"

9. [Clean Hashtags]:
4 to 6 relevant technical hashtags formatted as plain space-separated text (e.g., #Laravel #PHP #WebDevelopment #DatabaseDesign #SoftwareEngineering). Do NOT use Markdown links.

Deliver maximum engineering signal. No corporate buzzwords. Before finalizing, silently check that ${qualityCheck}, the post is complete, and no random foreign-language fragments remain.`;
}

// CLI test / preview runner
if (process.argv[1]) {
  const currentPath = fileURLToPath(import.meta.url);
  const invokedPath = path.resolve(process.argv[1]);

  if (currentPath === invokedPath) {
    const isNext = process.argv.includes('--next');
    const queryIdx = process.argv.indexOf('--query');
    const query = queryIdx !== -1 && process.argv[queryIdx + 1] ? process.argv[queryIdx + 1] : '';

    if (isNext) {
      const challenge = getNextChallenge();
      console.log('Next Scheduled Challenge:');
      console.log(JSON.stringify(challenge, null, 2));
    } else {
      const targetQuery = query || '2wash spatial postgis';
      console.log(`Running RAG Retrieval for query: "${targetQuery}"...`);
      retrieveProjectContext(targetQuery)
        .then((result) => {
          console.log(`Matched Project: ${result.matchedProject}`);
          console.log(`Matched Challenge: ${result.challenge?.title || 'None'}`);
          console.log(`Retrieved ${result.retrievedDocs.length} facts.`);
          const prompt = buildGroundedRAGPrompt({
            query: targetQuery,
            challenge: result.challenge,
            retrievedDocs: result.retrievedDocs,
          });
          console.log('\n--- Generated Grounded Prompt Preview (First 500 chars) ---');
          console.log(prompt.slice(0, 500) + '...\n');
        })
        .catch((err) => {
          console.error('RAG CLI failed:', err);
          process.exit(1);
        });
    }
  }
}
