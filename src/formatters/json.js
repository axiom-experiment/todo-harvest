/**
 * formatters/json.js — JSON output formatter for todo-harvest.
 *
 * Produces machine-readable JSON suitable for CI pipelines,
 * dashboards, and integrations with other tooling.
 */

import { relative } from 'node:path';

/**
 * Format entries as a JSON string.
 *
 * @param {import('../parser.js').TodoEntry[]} entries
 * @param {object} options
 * @param {string} options.rootDir - Project root for relative paths
 * @param {string[]} [options.keywords] - Keywords that were searched
 * @param {number|null} [options.maxTodos] - CI threshold
 * @param {boolean} [options.pretty] - Pretty-print (default: true)
 * @returns {string}
 */
export function formatJson(entries, options = {}) {
  const {
    rootDir,
    keywords = [],
    maxTodos = null,
    pretty = true
  } = options;

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const byKeyword = {};

  const formattedEntries = entries.map(entry => {
    severityCounts[entry.severity] = (severityCounts[entry.severity] || 0) + 1;
    byKeyword[entry.keyword] = (byKeyword[entry.keyword] || 0) + 1;

    return {
      file: rootDir ? relative(rootDir, entry.file) : entry.file,
      line: entry.line,
      keyword: entry.keyword,
      severity: entry.severity,
      message: entry.message,
      git: entry.author ? {
        author: entry.author,
        email: entry.authorEmail,
        date: entry.date,
        commit: entry.commitHash
      } : null
    };
  });

  const ciStatus = maxTodos !== null
    ? {
        threshold: maxTodos,
        count: entries.length,
        passed: entries.length <= maxTodos,
        excess: Math.max(0, entries.length - maxTodos)
      }
    : null;

  const output = {
    meta: {
      tool: 'todo-harvest',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      rootDir: rootDir || null,
      keywordsSearched: keywords
    },
    summary: {
      total: entries.length,
      bySeverity: severityCounts,
      byKeyword
    },
    ci: ciStatus,
    items: formattedEntries
  };

  return pretty
    ? JSON.stringify(output, null, 2)
    : JSON.stringify(output);
}
