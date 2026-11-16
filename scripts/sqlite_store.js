// SQLite-backed document store. Each legacy JSON file (pending_drafts.json,
// scenarios.json, bot_state.json) becomes one document row keyed by its
// basename, inside a single database next to it. Writes are transactional, so
// concurrent producers cannot corrupt state. A legacy JSON file is imported
// once, the first time its document is read, and is then left untouched as a
// backup.

import fs from 'node:fs';
import path from 'node:path';

// node:sqlite still prints an ExperimentalWarning on stderr, which pollutes the
// stdout/stderr contracts of the CLI scripts; swallow only that one warning.
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  if (typeof warning === 'string' && warning.startsWith('SQLite is an experimental')) return;
  return originalEmitWarning.call(this, warning, ...args);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = originalEmitWarning;

export const DB_FILENAME = 'linkedin_agent.db';
const BUSY_TIMEOUT_MS = 15000;

const connections = new Map();

function open(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  const dbPath = path.join(dir, DB_FILENAME);
  let entry = connections.get(dbPath);
  if (entry) return entry;
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    mirror_mtime REAL
  )`);
  const columns = db.prepare('PRAGMA table_info(documents)').all().map((c) => c.name);
  if (!columns.includes('mirror_mtime')) db.exec('ALTER TABLE documents ADD COLUMN mirror_mtime REAL');
  db.exec(`CREATE TABLE IF NOT EXISTS sequences (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  )`);
  entry = { db, depth: 0, queue: Promise.resolve() };
  connections.set(dbPath, entry);
  return entry;
}

const docName = (filePath) => path.basename(filePath);

function statOrNull(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Raw JSON text of a document, or null if absent.
 * The JSON file next to the database is a mirror of the document. If it was
 * changed outside this module (legacy import, n8n code nodes, manual edits) it
 * is re-imported, so SQLite stays authoritative without losing those writes.
 */
export function readDocRaw(filePath) {
  const { db } = open(filePath);
  const name = docName(filePath);
  const row = db.prepare('SELECT body, mirror_mtime FROM documents WHERE name = ?').get(name);
  const stat = statOrNull(filePath);
  if (!stat) {
    // The mirror was deleted after we wrote it: treat as an explicit reset.
    if (row && row.mirror_mtime !== null) {
      db.prepare('DELETE FROM documents WHERE name = ?').run(name);
      return null;
    }
    return row ? row.body : null;
  }
  if (row && row.mirror_mtime === stat.mtimeMs) return row.body;
  let external;
  try {
    external = fs.readFileSync(filePath, 'utf8');
    JSON.parse(external);
  } catch (err) {
    if (row) return row.body; // keep the last good document over a corrupt file
    throw err;
  }
  db.prepare(`INSERT INTO documents (name, body, updated_at, mirror_mtime) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at,
      mirror_mtime = excluded.mirror_mtime`)
    .run(name, external, new Date().toISOString(), stat.mtimeMs);
  return external;
}

export function writeDocRaw(filePath, body) {
  const { db } = open(filePath);
  const resolved = path.resolve(filePath);
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, resolved);
  db.prepare(`INSERT INTO documents (name, body, updated_at, mirror_mtime) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at,
      mirror_mtime = excluded.mirror_mtime`)
    .run(docName(filePath), body, new Date().toISOString(), fs.statSync(resolved).mtimeMs);
}

export function readDoc(filePath, fallback = null) {
  const raw = readDocRaw(filePath);
  return raw === null ? fallback : JSON.parse(raw);
}

export function writeDoc(filePath, value) {
  writeDocRaw(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Highest value ever recorded for a sequence (0 if none). */
export function getSequence(filePath, name) {
  const row = open(filePath).db.prepare('SELECT value FROM sequences WHERE name = ?').get(name);
  return row ? row.value : 0;
}

/** Raise a sequence to at least `value`; never lowers it. */
export function bumpSequence(filePath, name, value) {
  open(filePath).db.prepare(`INSERT INTO sequences (name, value) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)`).run(name, value);
}

function begin(entry) {
  if (entry.depth === 0) entry.db.exec('BEGIN IMMEDIATE');
  entry.depth += 1;
}

function end(entry, ok) {
  entry.depth -= 1;
  if (entry.depth === 0) entry.db.exec(ok ? 'COMMIT' : 'ROLLBACK');
}

/** Run `task` inside a write transaction (cross-process exclusive). */
export function transactionSync(filePath, task) {
  const entry = open(filePath);
  begin(entry);
  let ok = false;
  try {
    const result = task();
    ok = true;
    return result;
  } finally {
    end(entry, ok);
  }
}

/** Async variant; calls within one process are serialized, other processes wait on SQLite. */
export function transaction(filePath, task) {
  const entry = open(filePath);
  const run = entry.queue.then(async () => {
    begin(entry);
    let ok = false;
    try {
      const result = await task();
      ok = true;
      return result;
    } finally {
      end(entry, ok);
    }
  });
  entry.queue = run.catch(() => {});
  return run;
}
