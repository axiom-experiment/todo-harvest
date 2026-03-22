/**
 * tests/integration.test.js — Integration tests for the harvest() public API
 *
 * These tests create a real temporary directory with real files
 * and run the full harvest pipeline end-to-end.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { harvest, harvestAndFormat } from '../src/index.js';

let testDir;

before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'todo-harvest-integration-'));

  await mkdir(join(testDir, 'src'));
  await mkdir(join(testDir, 'lib'));

  // File 1: multiple keywords
  await writeFile(join(testDir, 'src', 'app.js'), [
    '// Application entry point',
    '// TODO: add graceful shutdown handler',
    'function startServer() {',
    '  // FIXME: hardcoded port 3000',
    '  const port = 3000;',
    '  // BUG: race condition if called twice',
    '  server.listen(port);',
    '}'
  ].join('\n'));

  // File 2: Python file
  await writeFile(join(testDir, 'lib', 'utils.py'), [
    '# Utility functions',
    '# TODO: add type hints',
    'def calculate(x, y):',
    '    # HACK: magic number, fix later',
    '    return x * 42 + y'
  ].join('\n'));

  // File 3: No todos
  await writeFile(join(testDir, 'src', 'clean.js'), [
    '// This file has no todos',
    'export const VERSION = "1.0.0";'
  ].join('\n'));

  // node_modules — should be ignored
  await mkdir(join(testDir, 'node_modules'));
  await writeFile(join(testDir, 'node_modules', 'fake.js'), '// TODO: should not appear');
});

after(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('harvest() integration', () => {

  it('finds todos across multiple files', async () => {
    const result = await harvest(testDir, { blame: false });
    assert.ok(result.total >= 5, `Expected at least 5 todos, got ${result.total}`);
  });

  it('returns correct structure', async () => {
    const result = await harvest(testDir, { blame: false });
    assert.ok('items' in result, 'Should have items');
    assert.ok('total' in result, 'Should have total');
    assert.ok('bySeverity' in result, 'Should have bySeverity');
    assert.ok('byKeyword' in result, 'Should have byKeyword');
  });

  it('finds BUG items (critical severity)', async () => {
    const result = await harvest(testDir, { blame: false });
    assert.ok(result.bySeverity.critical >= 1, 'Should find at least one BUG');
  });

  it('finds FIXME items (high severity)', async () => {
    const result = await harvest(testDir, { blame: false });
    assert.ok(result.bySeverity.high >= 1, 'Should find at least one FIXME or HACK');
  });

  it('does not include node_modules results', async () => {
    const result = await harvest(testDir, { blame: false });
    const hasNodeModules = result.items.some(i => i.file.includes('node_modules'));
    assert.equal(hasNodeModules, false, 'Should not include node_modules entries');
  });

  it('respects keyword filter', async () => {
    const result = await harvest(testDir, { blame: false, keywords: ['BUG'] });
    for (const item of result.items) {
      assert.equal(item.keyword, 'BUG', 'Should only return BUG entries');
    }
  });

  it('ci.passed = true when below threshold', async () => {
    const result = await harvest(testDir, { blame: false, maxTodos: 100 });
    assert.equal(result.ci.passed, true);
  });

  it('ci.passed = false when above threshold', async () => {
    const result = await harvest(testDir, { blame: false, maxTodos: 1 });
    assert.equal(result.ci.passed, false);
    assert.ok(result.ci.excess >= 1);
  });

  it('ci is null when maxTodos not provided', async () => {
    const result = await harvest(testDir, { blame: false });
    assert.equal(result.ci, null);
  });

  it('scans Python files by default', async () => {
    const result = await harvest(testDir, { blame: false });
    const hasPython = result.items.some(i => i.file.endsWith('.py'));
    assert.ok(hasPython, 'Should scan .py files by default');
  });

  it('extension filter restricts to specified types', async () => {
    const result = await harvest(testDir, { blame: false, extensions: ['.js'] });
    for (const item of result.items) {
      assert.ok(item.file.endsWith('.js'), 'Should only return .js entries');
    }
  });

  it('byKeyword counts are consistent with items', async () => {
    const result = await harvest(testDir, { blame: false });
    let total = 0;
    for (const count of Object.values(result.byKeyword)) {
      total += count;
    }
    assert.equal(total, result.total, 'byKeyword totals should equal result.total');
  });

});

describe('harvestAndFormat() integration', () => {

  it('returns table format string', async () => {
    const output = await harvestAndFormat(testDir, { blame: false, format: 'table', noColor: true });
    assert.equal(typeof output, 'string');
    assert.ok(output.length > 0);
  });

  it('returns valid JSON format string', async () => {
    const output = await harvestAndFormat(testDir, { blame: false, format: 'json' });
    assert.doesNotThrow(() => JSON.parse(output), 'JSON format should be valid JSON');
  });

  it('returns markdown format string', async () => {
    const output = await harvestAndFormat(testDir, { blame: false, format: 'markdown' });
    assert.ok(output.startsWith('#'), 'Markdown should start with heading');
  });

});
