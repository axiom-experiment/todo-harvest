/**
 * parser.js — Parses source file lines and extracts TODO-style comments.
 *
 * Matches comments in all major styles:
 *   // TODO: fix this
 *   # FIXME: broken
 *   /* HACK: workaround *\/
 *   -- BUG: SQL edge case
 *   <!-- NOTE: html comment -->
 *   * OPTIMIZE: slow query (inside JSDoc / block comment)
 */

// Default keywords to match (case-insensitive)
export const DEFAULT_KEYWORDS = [
  'TODO',
  'FIXME',
  'HACK',
  'BUG',
  'OPTIMIZE',
  'NOTE',
  'XXX',
  'TEMP',
  'REVIEW',
  'DEPRECATED'
];

// Severity mapping for color-coded output
export const KEYWORD_SEVERITY = {
  BUG: 'critical',
  FIXME: 'high',
  HACK: 'high',
  XXX: 'high',
  TODO: 'medium',
  OPTIMIZE: 'medium',
  TEMP: 'medium',
  REVIEW: 'low',
  NOTE: 'low',
  DEPRECATED: 'low'
};

/**
 * Build a regex that matches any of the given keywords in a comment.
 * Handles all common comment styles.
 *
 * @param {string[]} keywords
 * @returns {RegExp}
 */
function buildMatcher(keywords) {
  const kw = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // Match:
  //   comment_prefix + optional_space + KEYWORD + optional_colon + optional_space + message
  // Comment prefixes: //, #, --, *, <!--, /*
  return new RegExp(
    `(?:(?:\\/\\/|#|--|\\*|\\/\\*|<!--)\\s*)(${kw})(?:[:\\s]|$)(.*)`,
    'i'
  );
}

/**
 * Parse lines from a single file and extract all matching comments.
 *
 * @param {string[]} lines - Array of source lines
 * @param {string} filePath - Absolute path to the file (for metadata)
 * @param {string[]} keywords - Keywords to search for
 * @returns {Array<TodoEntry>}
 */
export function parseLines(lines, filePath, keywords = DEFAULT_KEYWORDS) {
  const matcher = buildMatcher(keywords);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines fast
    if (!trimmed) continue;

    const match = matcher.exec(trimmed);
    if (!match) continue;

    const keyword = match[1].toUpperCase();
    const message = (match[2] || '').trim()
      // Strip trailing comment closers: */ or -->
      .replace(/\*\/\s*$/, '')
      .replace(/-->\s*$/, '')
      .trim();

    entries.push({
      file: filePath,
      line: i + 1, // 1-based line number
      keyword,
      severity: KEYWORD_SEVERITY[keyword] || 'low',
      message: message || '(no message)',
      rawLine: line.trimEnd(),
      // git blame fields — populated later
      author: null,
      authorEmail: null,
      date: null,
      commitHash: null
    });
  }

  return entries;
}

/**
 * @typedef {object} TodoEntry
 * @property {string} file         - Absolute file path
 * @property {number} line         - 1-based line number
 * @property {string} keyword      - Matched keyword (e.g. 'TODO')
 * @property {string} severity     - 'critical' | 'high' | 'medium' | 'low'
 * @property {string} message      - The comment text after the keyword
 * @property {string} rawLine      - Full source line (trimmed of trailing whitespace)
 * @property {string|null} author  - Git blame author name (if available)
 * @property {string|null} authorEmail
 * @property {string|null} date    - ISO date string (if available)
 * @property {string|null} commitHash
 */
