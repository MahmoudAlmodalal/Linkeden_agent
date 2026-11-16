import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findJsonFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...findJsonFiles(fullPath));
    else if (entry.name.endsWith('.json')) result.push(fullPath);
  }
  return result;
}

test('every tracked JSON file parses successfully', () => {
  const files = [
    ...findJsonFiles(path.join(repoRoot, 'config')),
    ...findJsonFiles(path.join(repoRoot, 'data')),
    ...findJsonFiles(path.join(repoRoot, 'workflows')),
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, 'scripts', 'package.json'),
  ].filter((file) => !file.endsWith('embedding_cache.json'));

  assert.ok(files.length >= 5, 'expected core JSON configuration files to be present');
  for (const file of files) {
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(file, 'utf8')),
      `${path.relative(repoRoot, file)} must be valid JSON`,
    );
  }
});

test('post_topics.json is an array of uniquely slugged topics with supported languages', () => {
  const topics = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config', 'post_topics.json'), 'utf8'),
  );
  assert.ok(Array.isArray(topics) && topics.length > 0);
  const slugs = new Set();
  for (const topic of topics) {
    assert.ok(topic.slug, 'each topic needs a slug');
    assert.equal(slugs.has(topic.slug), false, `duplicate slug: ${topic.slug}`);
    slugs.add(topic.slug);
    assert.ok(topic.title && topic.concept, `topic ${topic.slug} needs title and concept`);
    assert.ok(['ar', 'en'].includes(topic.language), `topic ${topic.slug} has unsupported language`);
    assert.ok(Array.isArray(topic.keywords), `topic ${topic.slug} needs keywords`);
  }
});

test('workflow exports reference script files that exist', () => {
  for (const name of ['workflow_1_staging.json', 'workflow_2_publishing.json']) {
    const workflow = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'workflows', name), 'utf8'),
    );
    for (const node of workflow.nodes) {
      const code = node?.parameters?.jsCode || '';
      const referenced = [...code.matchAll(/\/scripts\/([\w.-]+\.js)/g)].map((m) => m[1]);
      for (const script of referenced) {
        assert.ok(
          fs.existsSync(path.join(repoRoot, 'scripts', script)),
          `${name} references missing script: ${script}`,
        );
      }
    }
  }
});
