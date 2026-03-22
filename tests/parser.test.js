/**
 * tests/parser.test.js — Unit tests for the comment parser
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLines, DEFAULT_KEYWORDS } from '../src/parser.js';

describe('parseLines()', () => {

  it('parses a basic // TODO comment', () => {
    const lines = ['// TODO: fix this bug'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'TODO');
    assert.equal(result[0].line, 1);
    assert.equal(result[0].message, 'fix this bug');
    assert.equal(result[0].severity, 'medium');
  });

  it('parses a # FIXME comment (Python-style)', () => {
    const lines = ['# FIXME: this crashes on empty input'];
    const result = parseLines(lines, '/fake/file.py');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'FIXME');
    assert.equal(result[0].severity, 'high');
    assert.equal(result[0].message, 'this crashes on empty input');
  });

  it('parses a HACK comment', () => {
    const lines = ['  // HACK: temporary workaround for API v2 breaking change'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'HACK');
    assert.equal(result[0].severity, 'high');
  });

  it('parses a BUG comment as critical severity', () => {
    const lines = ['// BUG: off-by-one error in loop bounds'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'BUG');
    assert.equal(result[0].severity, 'critical');
  });

  it('is case-insensitive for keywords', () => {
    const lines = ['// todo: lowercase keyword', '// Todo: mixed case'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 2);
    assert.equal(result[0].keyword, 'TODO');
    assert.equal(result[1].keyword, 'TODO');
  });

  it('handles multiple todos in one file', () => {
    const lines = [
      '// TODO: first thing',
      'const x = 1;',
      '// FIXME: second thing',
      '',
      '// HACK: third thing'
    ];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 3);
    assert.equal(result[0].line, 1);
    assert.equal(result[1].line, 3);
    assert.equal(result[2].line, 5);
  });

  it('skips blank lines', () => {
    const lines = ['', '   ', '\t', '// TODO: real one'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].line, 4);
  });

  it('respects custom keyword list', () => {
    const lines = [
      '// TODO: should be skipped',
      '// REVIEW: should be found',
      '// DEPRECATED: should be found'
    ];
    const result = parseLines(lines, '/fake/file.js', ['REVIEW', 'DEPRECATED']);
    assert.equal(result.length, 2);
    assert.equal(result[0].keyword, 'REVIEW');
    assert.equal(result[1].keyword, 'DEPRECATED');
  });

  it('handles TODO without message gracefully', () => {
    const lines = ['// TODO'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].message, '(no message)');
  });

  it('strips trailing block comment closers from message', () => {
    const lines = ['/* TODO: clean up this code */'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.ok(!result[0].message.includes('*/'), 'Should strip */ from message');
  });

  it('initializes git blame fields to null', () => {
    const lines = ['// TODO: test blame null init'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result[0].author, null);
    assert.equal(result[0].authorEmail, null);
    assert.equal(result[0].date, null);
    assert.equal(result[0].commitHash, null);
  });

  it('returns correct file path in each entry', () => {
    const lines = ['// TODO: check file path'];
    const result = parseLines(lines, '/projects/myapp/src/utils.js');
    assert.equal(result[0].file, '/projects/myapp/src/utils.js');
  });

  it('handles OPTIMIZE keyword', () => {
    const lines = ['// OPTIMIZE: slow database query, add index'];
    const result = parseLines(lines, '/fake/file.js');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'OPTIMIZE');
    assert.equal(result[0].severity, 'medium');
  });

  it('DEFAULT_KEYWORDS contains all expected keywords', () => {
    const expected = ['TODO', 'FIXME', 'HACK', 'BUG', 'OPTIMIZE', 'NOTE', 'XXX', 'TEMP', 'REVIEW', 'DEPRECATED'];
    for (const kw of expected) {
      assert.ok(DEFAULT_KEYWORDS.includes(kw), `Missing keyword: ${kw}`);
    }
  });

  it('handles Python-style inline comments', () => {
    const lines = ['result = compute()  # TODO: handle NaN case'];
    const result = parseLines(lines, '/fake/file.py');
    assert.equal(result.length, 1);
    assert.equal(result[0].keyword, 'TODO');
    assert.ok(result[0].message.includes('handle NaN case'));
  });
});
