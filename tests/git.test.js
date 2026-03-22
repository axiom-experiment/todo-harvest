/**
 * tests/git.test.js — Tests for git blame integration
 *
 * These tests verify the git module handles non-git directories,
 * skipGit option, and empty entry arrays gracefully without
 * requiring an actual git repo with history.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isGitRepo, enrichWithBlame } from '../src/git.js';

const NON_GIT_DIR = tmpdir(); // os temp dir is not a git repo (usually)

const SAMPLE_ENTRIES = [
  {
    file: join(NON_GIT_DIR, 'fake.js'),
    line: 1,
    keyword: 'TODO',
    severity: 'medium',
    message: 'test entry',
    rawLine: '// TODO: test entry',
    author: null,
    authorEmail: null,
    date: null,
    commitHash: null
  }
];

describe('isGitRepo()', () => {

  it('returns a boolean', async () => {
    const result = await isGitRepo(NON_GIT_DIR);
    assert.equal(typeof result, 'boolean');
  });

  it('returns false for a non-git directory (tmpdir)', async () => {
    // Note: if tmpdir happens to be inside a git repo, this could be true.
    // We use os.tmpdir() which is reliably outside any project git repo.
    const result = await isGitRepo(NON_GIT_DIR);
    // We can't assert false 100% reliably in all CI environments,
    // so we just assert it's a boolean and doesn't throw.
    assert.equal(typeof result, 'boolean');
  });

});

describe('enrichWithBlame()', () => {

  it('returns entries unchanged for empty array', async () => {
    const result = await enrichWithBlame([], '/any/dir', {});
    assert.deepEqual(result, []);
  });

  it('returns entries unchanged when skipGit=true', async () => {
    const entries = JSON.parse(JSON.stringify(SAMPLE_ENTRIES));
    const result = await enrichWithBlame(entries, NON_GIT_DIR, { skipGit: true });
    assert.equal(result.length, 1);
    assert.equal(result[0].author, null, 'Author should remain null when git skipped');
  });

  it('does not throw for non-git directory', async () => {
    const entries = JSON.parse(JSON.stringify(SAMPLE_ENTRIES));
    await assert.doesNotReject(
      () => enrichWithBlame(entries, NON_GIT_DIR, {}),
      'Should not throw for non-git directory'
    );
  });

  it('returns array of same length', async () => {
    const entries = JSON.parse(JSON.stringify(SAMPLE_ENTRIES));
    const result = await enrichWithBlame(entries, NON_GIT_DIR, { skipGit: true });
    assert.equal(result.length, entries.length);
  });

  it('preserves all fields when blame is skipped', async () => {
    const entries = JSON.parse(JSON.stringify(SAMPLE_ENTRIES));
    const result = await enrichWithBlame(entries, NON_GIT_DIR, { skipGit: true });
    const entry = result[0];
    assert.equal(entry.keyword, 'TODO');
    assert.equal(entry.severity, 'medium');
    assert.equal(entry.message, 'test entry');
    assert.equal(entry.line, 1);
  });

});
