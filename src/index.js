/**
 * index.js — Public API for todo-harvest.
 *
 * Use this if you want to integrate todo-harvest programmatically
 * rather than via the CLI.
 *
 * @example
 * import { harvest } from 'todo-harvest';
 *
 * const result = await harvest('./my-project', {
 *   keywords: ['TODO', 'FIXME', 'HACK'],
 *   blame: true,
 *   maxTodos: 50
 * });
 *
 * console.log(`Found ${result.total} items`);
 * if (!result.ci.passed) process.exit(1);
 */

import { resolve } from 'node:path';
import { scanFiles, readFileLines } from './scanner.js';
import { parseLines, DEFAULT_KEYWORDS } from './parser.js';
import { enrichWithBlame } from './git.js';
import { formatTable } from './formatters/table.js';
import { formatJson } from './formatters/json.js';
import { formatMarkdown } from './formatters/markdown.js';

export { DEFAULT_KEYWORDS } from './parser.js';
export { KEYWORD_SEVERITY } from './parser.js';

/**
 * @typedef {object} HarvestOptions
 * @property {string[]} [keywords]         - Keywords to search (default: all 10)
 * @property {string[]} [extensions]       - File extensions to scan
 * @property {string[]} [ignorePatterns]   - Directory/file patterns to ignore
 * @property {boolean}  [blame=true]       - Enrich with git blame data
 * @property {number|null} [maxTodos=null] - CI failure threshold
 * @property {number}   [maxDepth=20]      - Max directory traversal depth
 */

/**
 * @typedef {object} HarvestResult
 * @property {import('./parser.js').TodoEntry[]} items
 * @property {number} total
 * @property {{ critical: number, high: number, medium: number, low: number }} bySeverity
 * @property {Record<string, number>} byKeyword
 * @property {{ threshold: number|null, count: number, passed: boolean, excess: number }|null} ci
 */

/**
 * Harvest TODO-style comments from a directory.
 *
 * @param {string} dir - Directory to scan
 * @param {HarvestOptions} options
 * @returns {Promise<HarvestResult>}
 */
export async function harvest(dir, options = {}) {
  const {
    keywords = DEFAULT_KEYWORDS,
    extensions = null,
    ignorePatterns = [],
    blame = true,
    maxTodos = null,
    maxDepth = 20
  } = options;

  const rootDir = resolve(dir);

  // 1. Find all files
  const files = await scanFiles(rootDir, { extensions, ignorePatterns, maxDepth });

  // 2. Parse each file for TODO comments
  let allEntries = [];
  for (const filePath of files) {
    const lines = await readFileLines(filePath);
    const entries = parseLines(lines, filePath, keywords);
    allEntries.push(...entries);
  }

  // 3. Enrich with git blame (if requested)
  if (blame) {
    allEntries = await enrichWithBlame(allEntries, rootDir, {});
  }

  // 4. Build result
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byKeyword = {};
  for (const entry of allEntries) {
    bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    byKeyword[entry.keyword] = (byKeyword[entry.keyword] || 0) + 1;
  }

  const ci = maxTodos !== null ? {
    threshold: maxTodos,
    count: allEntries.length,
    passed: allEntries.length <= maxTodos,
    excess: Math.max(0, allEntries.length - maxTodos)
  } : null;

  return {
    items: allEntries,
    total: allEntries.length,
    bySeverity,
    byKeyword,
    ci
  };
}

/**
 * Convenience: harvest and format in one call.
 *
 * @param {string} dir
 * @param {HarvestOptions & { format?: 'table'|'json'|'markdown', rootDir?: string, noColor?: boolean }} options
 * @returns {Promise<string>}
 */
export async function harvestAndFormat(dir, options = {}) {
  const { format = 'table', rootDir, noColor = false, ...harvestOpts } = options;
  const result = await harvest(dir, harvestOpts);

  switch (format) {
    case 'json':
      return formatJson(result.items, {
        rootDir: rootDir || resolve(dir),
        keywords: harvestOpts.keywords || DEFAULT_KEYWORDS,
        maxTodos: harvestOpts.maxTodos || null
      });
    case 'markdown':
      return formatMarkdown(result.items, {
        rootDir: rootDir || resolve(dir),
        maxTodos: harvestOpts.maxTodos || null
      });
    case 'table':
    default:
      return formatTable(result.items, {
        rootDir: rootDir || resolve(dir),
        noColor,
        maxTodos: harvestOpts.maxTodos || null
      });
  }
}

export { formatTable } from './formatters/table.js';
export { formatJson } from './formatters/json.js';
export { formatMarkdown } from './formatters/markdown.js';
