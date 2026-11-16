// Single source of truth for pending-draft persistence.
// All producers (staging workflow, Telegram router, publisher) must go through
// these helpers so ID allocation and read-modify-write cycles cannot race.

import {
  readDocRaw,
  writeDoc,
  bumpSequence,
  getSequence,
  transaction,
  transactionSync,
} from './sqlite_store.js';

const DRAFT_SEQUENCE = 'draft_id';

/**
 * Read pending drafts from either the canonical array format or the legacy
 * { drafts: [...] } envelope. A missing document yields an empty list.
 * Legacy JSON files are imported into SQLite on first read.
 */
export function readDraftsFile(filePath) {
  const raw = readDocRaw(filePath);
  if (raw === null) return { drafts: [], format: 'array', rawObject: null };
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { drafts: parsed, format: 'array', rawObject: null };
  if (parsed && Array.isArray(parsed.drafts)) {
    return { drafts: parsed.drafts, format: 'object', rawObject: parsed };
  }
  return { drafts: [], format: 'array', rawObject: null };
}

/** Persist pending drafts, preserving the original envelope format. */
export function writeDraftsFile(filePath, drafts, formatInfo = { format: 'array' }) {
  if (!Array.isArray(drafts)) throw new TypeError('Drafts must be an array');
  const output =
    formatInfo.format === 'object' && formatInfo.rawObject
      ? { ...formatInfo.rawObject, drafts }
      : drafts;
  transactionSync(filePath, () => {
    writeDoc(filePath, output);
    const highest = nextDraftId(drafts) - 1;
    if (highest > 0) bumpSequence(filePath, DRAFT_SEQUENCE, highest);
  });
}

/** Next strictly incrementing numeric draft ID. */
export function nextDraftId(drafts = []) {
  if (!Array.isArray(drafts) || drafts.length === 0) return 1;
  return drafts.reduce((max, d) => {
    const value = Number(d?.id ?? d?.draft_id);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0) + 1;
}

/** Cross-process mutex (SQLite write transaction) around the draft store. */
export function withDraftLock(filePath, task) {
  return transaction(filePath, task);
}

/** Synchronous variant for the legacy sync APIs in telegram_router.js. */
export function withDraftLockSync(filePath, task) {
  return transactionSync(filePath, task);
}

/** Next draft ID for a store: never reuses an ID, even after drafts are removed. */
export function nextDraftIdFor(filePath) {
  const fromDrafts = nextDraftId(readDraftsFile(filePath).drafts);
  return Math.max(fromDrafts, getSequence(filePath, DRAFT_SEQUENCE) + 1);
}

/** Reserve the next draft ID under lock. */
export async function allocateDraftId(filePath) {
  return withDraftLock(filePath, () => {
    const id = nextDraftIdFor(filePath);
    bumpSequence(filePath, DRAFT_SEQUENCE, id);
    return id;
  });
}

/**
 * Atomically read, transform and persist the draft list.
 * `mutator` receives the drafts array and must return either a new array or
 * { drafts, result } when it also needs to report a value to the caller.
 */
export async function mutateDrafts(filePath, mutator) {
  return withDraftLock(filePath, () => {
    const info = readDraftsFile(filePath);
    const outcome = mutator(info.drafts);
    const nextDrafts = Array.isArray(outcome) ? outcome : outcome?.drafts;
    if (!Array.isArray(nextDrafts)) {
      throw new TypeError('mutator must return a drafts array or { drafts, result }');
    }
    writeDraftsFile(filePath, nextDrafts, info);
    return Array.isArray(outcome) ? undefined : outcome.result;
  });
}
