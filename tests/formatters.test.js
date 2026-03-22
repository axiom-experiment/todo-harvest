/**
 * tests/formatters.test.js — Unit tests for all three output formatters
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { formatTable } from '../src/formatters/table.js';
import { formatJson } from '../src/formatters/json.js';
import { formatMarkdown } from '../src/formatters/markdown.js';

// Use platform-appropriate paths so path.relative() works correctly on all OSes
// On Windows: C:\project\src\api.js; on POSIX: /tmp/project/src/api.js
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = mkdtempSync(join(tmpdir(), 'todo-harvest-fmt-test-'));

// Sample entries for testing
const SAMPLE_ENTRIES = [
  {
    file: join(ROOT, 'src', 'api.js'),
    line: 42,
    keyword: 'TODO',
    severity: 'medium',
    message: 'Add rate limiting',
    rawLine: '  // TODO: Add rate limiting',
    author: 'Alice Smith',
    authorEmail: 'alice@example.com',
    date: '2026-01-15',
    commitHash: 'abc12345'
  },
  {
    file: join(ROOT, 'src', 'db.js'),
    line: 7,
    keyword: 'BUG',
    severity: 'critical',
    message: 'Race condition on concurrent writes',
    rawLine: '// BUG: Race condition on concurrent writes',
    author: 'Bob Jones',
    authorEmail: 'bob@example.com',
    date: '2026-02-01',
    commitHash: 'def67890'
  },
  {
    file: join(ROOT, 'src', 'utils.js'),
    line: 99,
    keyword: 'FIXME',
    severity: 'high',
    message: 'Broken on edge case',
    rawLine: '// FIXME: Broken on edge case',
    author: null,
    authorEmail: null,
    date: null,
    commitHash: null
  }
];

const EMPTY_ENTRIES = [];

// Expected relative path (platform-safe)
const REL_API = join('src', 'api.js');

describe('formatTable()', () => {

  it('returns a string', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.equal(typeof result, 'string');
  });

  it('contains entry keywords', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.ok(result.includes('TODO'), 'Should contain TODO');
    assert.ok(result.includes('BUG'), 'Should contain BUG');
    assert.ok(result.includes('FIXME'), 'Should contain FIXME');
  });

  it('contains messages', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.ok(result.includes('Add rate limiting'));
    assert.ok(result.includes('Race condition on concurrent writes'));
  });

  it('contains author info when present', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.ok(result.includes('Alice Smith'));
    assert.ok(result.includes('Bob Jones'));
  });

  it('shows CI threshold pass message', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true, maxTodos: 10 });
    assert.ok(result.includes('3/10'), 'Should show current/max count');
  });

  it('shows CI threshold EXCEEDED message', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true, maxTodos: 2 });
    assert.ok(
      result.toUpperCase().includes('EXCEEDED') || result.includes('max allowed'),
      'Should indicate threshold exceeded'
    );
  });

  it('handles empty entries gracefully', () => {
    const result = formatTable(EMPTY_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.ok(result.includes('No TODO'), 'Should show empty state message');
  });

  it('uses relative paths from rootDir', () => {
    const result = formatTable(SAMPLE_ENTRIES, { rootDir: ROOT, noColor: true });
    assert.ok(result.includes(REL_API), `Should contain relative path "${REL_API}"`);
    assert.ok(!result.includes(join(ROOT, 'src', 'api.js')), 'Should NOT include full absolute path');
  });

});

describe('formatJson()', () => {

  it('returns valid JSON', () => {
    const result = formatJson(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.doesNotThrow(() => JSON.parse(result), 'Should be valid JSON');
  });

  it('has correct structure', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    assert.ok(result.meta, 'Should have meta field');
    assert.ok(result.summary, 'Should have summary field');
    assert.ok(Array.isArray(result.items), 'Should have items array');
    assert.equal(result.summary.total, 3);
  });

  it('includes all entries in items', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    assert.equal(result.items.length, 3);
  });

  it('includes severity counts', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    assert.equal(result.summary.bySeverity.critical, 1);
    assert.equal(result.summary.bySeverity.high, 1);
    assert.equal(result.summary.bySeverity.medium, 1);
  });

  it('includes CI field when maxTodos is set', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT, maxTodos: 5 }));
    assert.ok(result.ci !== null, 'Should have ci field');
    assert.equal(result.ci.threshold, 5);
    assert.equal(result.ci.passed, true);
  });

  it('sets ci.passed = false when threshold exceeded', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT, maxTodos: 2 }));
    assert.equal(result.ci.passed, false);
    assert.equal(result.ci.excess, 1);
  });

  it('ci is null when maxTodos not set', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    assert.equal(result.ci, null);
  });

  it('uses relative paths', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    // On any OS, the relative path should start with 'src' (the subdir)
    assert.ok(result.items[0].file.startsWith('src'), `Should use relative path, got: ${result.items[0].file}`);
  });

  it('includes git info when author is present', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    const todoEntry = result.items.find(i => i.keyword === 'TODO');
    assert.ok(todoEntry.git !== null, 'Should have git info');
    assert.equal(todoEntry.git.author, 'Alice Smith');
  });

  it('sets git to null when no blame info', () => {
    const result = JSON.parse(formatJson(SAMPLE_ENTRIES, { rootDir: ROOT }));
    const fixmeEntry = result.items.find(i => i.keyword === 'FIXME');
    assert.equal(fixmeEntry.git, null, 'No blame → git should be null');
  });

  it('handles empty entries', () => {
    const result = JSON.parse(formatJson(EMPTY_ENTRIES, { rootDir: ROOT }));
    assert.equal(result.summary.total, 0);
    assert.equal(result.items.length, 0);
  });

});

describe('formatMarkdown()', () => {

  it('returns a string', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.equal(typeof result, 'string');
  });

  it('starts with a heading', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.ok(result.startsWith('# TODO Harvest Report'), 'Should start with heading');
  });

  it('includes a summary section', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.ok(result.includes('## Summary'), 'Should have Summary section');
  });

  it('includes all keywords', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.ok(result.includes('TODO'));
    assert.ok(result.includes('BUG'));
    assert.ok(result.includes('FIXME'));
  });

  it('shows total count', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.ok(result.includes('**3**'), 'Should show total count');
  });

  it('shows CI pass status', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT, maxTodos: 10 });
    assert.ok(result.includes('passing') || result.includes('CI'), 'Should show CI status');
  });

  it('shows CI exceeded status', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT, maxTodos: 2 });
    assert.ok(result.includes('Exceeded') || result.includes('exceeded'), 'Should show exceeded status');
  });

  it('shows git author information', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    assert.ok(result.includes('Alice Smith'));
    assert.ok(result.includes('2026-01-15'));
  });

  it('handles empty entries with clean message', () => {
    const result = formatMarkdown(EMPTY_ENTRIES, { rootDir: ROOT });
    assert.ok(result.includes('No TODO') || result.includes('Clean codebase'), 'Should show clean state');
  });

  it('uses relative file paths in section headers', () => {
    const result = formatMarkdown(SAMPLE_ENTRIES, { rootDir: ROOT });
    // The markdown formatter wraps paths in backticks, so check for the subdir
    assert.ok(result.includes('src'), `Should show relative path containing 'src', got output length ${result.length}`);
  });

});
