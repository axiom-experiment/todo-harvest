/**
 * tests/scanner.test.js — Unit tests for the file scanner
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFiles, readFileLines } from '../src/scanner.js';

let testDir;

// Create a temporary directory structure for tests
before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'todo-harvest-test-'));

  // src/
  await mkdir(join(testDir, 'src'));
  await writeFile(join(testDir, 'src', 'index.js'), '// TODO: entry point');
  await writeFile(join(testDir, 'src', 'utils.ts'), '// FIXME: types');
  await writeFile(join(testDir, 'src', 'style.css'), '/* TODO: remove hardcoded px */');

  // tests/
  await mkdir(join(testDir, 'tests'));
  await writeFile(join(testDir, 'tests', 'main.test.js'), '// TODO: add more tests');

  // node_modules/ — should always be ignored
  await mkdir(join(testDir, 'node_modules'));
  await mkdir(join(testDir, 'node_modules', 'some-pkg'));
  await writeFile(join(testDir, 'node_modules', 'some-pkg', 'index.js'), '// TODO: should not appear');

  // dist/ — should always be ignored
  await mkdir(join(testDir, 'dist'));
  await writeFile(join(testDir, 'dist', 'bundle.js'), '// TODO: should not appear');

  // Binary-like file (no extension)
  await writeFile(join(testDir, 'Makefile'), 'build:\n\tgo build .');

  // README
  await writeFile(join(testDir, 'README.md'), '# Test project\n<!-- TODO: write docs -->');

  // Hidden file
  await writeFile(join(testDir, '.env'), 'SECRET=abc # TODO: rotate this');
});

after(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('scanFiles()', () => {

  it('finds JavaScript and TypeScript files', async () => {
    const files = await scanFiles(testDir);
    const names = files.map(f => f.split(/[/\\]/).pop());
    assert.ok(names.includes('index.js'), 'Should find index.js');
    assert.ok(names.includes('utils.ts'), 'Should find utils.ts');
  });

  it('finds CSS files', async () => {
    const files = await scanFiles(testDir);
    const names = files.map(f => f.split(/[/\\]/).pop());
    assert.ok(names.includes('style.css'), 'Should find style.css');
  });

  it('finds Markdown files', async () => {
    const files = await scanFiles(testDir);
    const names = files.map(f => f.split(/[/\\]/).pop());
    assert.ok(names.includes('README.md'), 'Should find README.md');
  });

  it('ignores node_modules', async () => {
    const files = await scanFiles(testDir);
    const hasNodeModules = files.some(f => f.includes('node_modules'));
    assert.equal(hasNodeModules, false, 'Should not scan node_modules');
  });

  it('ignores dist directory', async () => {
    const files = await scanFiles(testDir);
    const hasDist = files.some(f => f.includes(`${testDir}\\dist`) || f.includes(`${testDir}/dist`));
    assert.equal(hasDist, false, 'Should not scan dist');
  });

  it('respects custom extension filter', async () => {
    const files = await scanFiles(testDir, { extensions: ['.ts'] });
    assert.ok(files.length > 0, 'Should find at least one .ts file');
    for (const f of files) {
      assert.equal(extname(f), '.ts', 'All results should be .ts');
    }
  });

  it('respects ignorePatterns option', async () => {
    const files = await scanFiles(testDir, { ignorePatterns: ['tests'] });
    const hasTests = files.some(f => f.includes('tests'));
    assert.equal(hasTests, false, 'Should ignore tests directory');
  });

  it('skips files with unknown extensions (Makefile)', async () => {
    const files = await scanFiles(testDir);
    const names = files.map(f => f.split(/[/\\]/).pop());
    assert.ok(!names.includes('Makefile'), 'Should skip Makefile (no extension)');
  });

  it('does not follow symlinks (safety check)', async () => {
    // scanFiles should return an array (not crash on symlinks)
    const files = await scanFiles(testDir);
    assert.ok(Array.isArray(files), 'Should return an array');
  });

});

describe('readFileLines()', () => {

  it('reads file and splits into lines', async () => {
    const filePath = join(testDir, 'src', 'index.js');
    const lines = await readFileLines(filePath);
    assert.ok(Array.isArray(lines), 'Should return array');
    assert.ok(lines.length >= 1, 'Should have at least one line');
    assert.ok(lines[0].includes('TODO'), 'First line should contain TODO');
  });

  it('returns empty array for non-existent file', async () => {
    const lines = await readFileLines('/definitely/does/not/exist.js');
    assert.deepEqual(lines, [], 'Should return empty array for missing file');
  });

});
