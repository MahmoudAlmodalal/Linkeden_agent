// Single source of truth for pending-draft persistence.
// All producers (staging workflow, Telegram router, publisher) must go through
// these helpers so ID allocation and read-modify-write cycles cannot race.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Read pending drafts from either the canonical array format or the legacy
 * { drafts: [...] } envelope. A missing or unreadable file yields an empty list.
 */
export function readDraftsFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { drafts: parsed, format: 'array', rawObject: null };
    if (parsed && Array.isArray(parsed.drafts)) {
      return { drafts: parsed.drafts, format: 'object', rawObject: parsed };
    }
    return { drafts: [], format: 'array', rawObject: null };
  } catch (err) {
    if (err.code === 'ENOENT') return { drafts: [], format: 'array', rawObject: null };
    throw err;
  }
}

/** Atomically persist pending drafts, preserving the original envelope format. */
export function writeDraftsFile(filePath, drafts, formatInfo = { format: 'array' }) {
  if (!Array.isArray(drafts)) throw new TypeError('Drafts must be an array');
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const output =
    formatInfo.format === 'object' && formatInfo.rawObject
      ? { ...formatInfo.rawObject, drafts }
      : drafts;
  const tempPath = `${resolved}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, resolved);
}

/** Next strictly incrementing numeric draft ID. */
export function nextDraftId(drafts = []) {
  if (!Array.isArray(drafts) || drafts.length === 0) return 1;
  return drafts.reduce((max, d) => {
    const value = Number(d?.id ?? d?.draft_id);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0) + 1;
}

/**
 * Cross-process mutex around a draft file. Uses an exclusive-create lock file
 * with stale-lock recovery so a crashed worker cannot block the queue forever.
 */
export async function withDraftLock(filePath, task, { timeoutMs = 15000, retryMs = 25 } = {}) {
  const lockPath = `${path.resolve(filePath)}.lock`;
  const deadline = Date.now() + timeoutMs;
  let fd = null;

  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > timeoutMs) fs.unlinkSync(lockPath);
      } catch {
        // Lock was removed by another worker; retry.
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  if (fd === null) {
    throw new Error(`Timed out waiting for draft lock: ${lockPath}`);
  }

  try {
    return await task();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Another worker may already have cleaned it up.
    }
  }
}

/**
 * Synchronous variant for the legacy sync APIs in telegram_router.js.
 * The critical sections are tiny (one read + one write), so blocking briefly
 * is preferable to changing every caller to async.
 */
export function withDraftLockSync(filePath, task, { timeoutMs = 15000, retryMs = 25 } = {}) {
  const lockPath = `${path.resolve(filePath)}.lock`;
  const deadline = Date.now() + timeoutMs;
  const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
  let fd = null;

  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > timeoutMs) fs.unlinkSync(lockPath);
      } catch {
        // Lock already released by another worker.
      }
      Atomics.wait(sleepBuffer, 0, 0, retryMs);
    }
  }

  if (fd === null) {
    throw new Error(`Timed out waiting for draft lock: ${lockPath}`);
  }

  try {
    return task();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Already removed.
    }
  }
}

/** Reserve the next draft ID under lock. */
export async function allocateDraftId(filePath) {
  return withDraftLock(filePath, () => nextDraftId(readDraftsFile(filePath).drafts));
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
