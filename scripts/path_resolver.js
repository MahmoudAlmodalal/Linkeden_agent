import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Resolves a path within the data directory, whether running inside Docker (/data)
 * or locally on host (<repo>/data).
 *
 * @param  {...string} parts - Path fragments
 * @returns {string} Absolute resolved path
 */
export function resolveDataPath(...parts) {
  const joined = parts.length > 0 ? path.join(...parts) : '';

  if (path.isAbsolute(joined)) {
    if (fs.existsSync(joined)) return joined;

    // Check inside Docker /data mount
    if (fs.existsSync('/data')) {
      const containerPath = path.resolve('/data', joined.replace(/^\/?data\/?/, ''));
      if (fs.existsSync(containerPath)) return containerPath;
    }

    // Check inside host repo data dir
    const relFromRoot = joined.replace(/^\/?data\/?/, '');
    const repoCandidate = path.resolve(REPO_ROOT, 'data', relFromRoot);
    if (fs.existsSync(repoCandidate)) return repoCandidate;

    const cwdCandidate = path.resolve(process.cwd(), joined.replace(/^\//, ''));
    if (fs.existsSync(cwdCandidate)) return cwdCandidate;

    return joined;
  }

  const rel = joined.replace(/^\/?data\/?/, '');
  if (fs.existsSync('/data')) {
    return path.resolve('/data', rel);
  }

  // Local fallback: prefer REPO_ROOT if it exists, else process.cwd()
  const repoData = path.resolve(REPO_ROOT, 'data');
  if (fs.existsSync(repoData)) {
    return path.resolve(repoData, rel);
  }
  return path.resolve(process.cwd(), 'data', rel);
}

/**
 * Resolves a path within the assets directory, whether running inside Docker (/assets)
 * or locally on host (<repo>/assets).
 *
 * @param  {...string} parts - Path fragments
 * @returns {string} Absolute resolved path
 */
export function resolveAssetPath(...parts) {
  const joined = parts.length > 0 ? path.join(...parts) : '';

  if (path.isAbsolute(joined)) {
    if (fs.existsSync(joined)) return joined;

    // Check inside Docker /assets mount
    if (fs.existsSync('/assets')) {
      const containerPath = path.resolve('/assets', joined.replace(/^\/?assets\/?/, ''));
      if (fs.existsSync(containerPath)) return containerPath;
    }

    // Check inside host repo assets dir
    const relFromRoot = joined.replace(/^\/?assets\/?/, '');
    const repoCandidate = path.resolve(REPO_ROOT, 'assets', relFromRoot);
    if (fs.existsSync(repoCandidate)) return repoCandidate;

    const cwdCandidate = path.resolve(process.cwd(), joined.replace(/^\//, ''));
    if (fs.existsSync(cwdCandidate)) return cwdCandidate;

    return joined;
  }

  const rel = joined.replace(/^\/?assets\/?/, '');
  if (fs.existsSync('/assets')) {
    return path.resolve('/assets', rel);
  }

  // Local fallback: prefer REPO_ROOT if it exists, else process.cwd()
  const repoAssets = path.resolve(REPO_ROOT, 'assets');
  if (fs.existsSync(repoAssets)) {
    return path.resolve(repoAssets, rel);
  }
  return path.resolve(process.cwd(), 'assets', rel);
}
