/**
 * formatters/table.js — Rich terminal table output for todo-harvest.
 *
 * Produces a color-coded, human-readable table output with summary stats.
 * Uses chalk for ANSI colors, with automatic fallback if chalk is unavailable.
 */

import { relative } from 'node:path';

const SEVERITY_COLORS = {
  critical: '\x1b[31m',  // red
  high:     '\x1b[33m',  // yellow
  medium:   '\x1b[36m',  // cyan
  low:      '\x1b[90m'   // gray
};

const SEVERITY_EMOJI = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🔵'
};

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const WHITE = '\x1b[37m';

/**
 * Format entries as a terminal table.
 *
 * @param {import('../parser.js').TodoEntry[]} entries
 * @param {object} options
 * @param {string} options.rootDir - Project root for relative paths
 * @param {boolean} [options.noColor] - Disable ANSI colors
 * @param {boolean} [options.noEmoji] - Disable emoji severity indicators
 * @param {number|null} [options.maxTodos] - CI threshold (null = no limit)
 * @returns {string}
 */
export function formatTable(entries, options = {}) {
  const { rootDir, noColor = false, noEmoji = false, maxTodos = null } = options;

  const c = (code, text) => noColor ? text : `${code}${text}${RESET}`;
  const bold = t => c(BOLD, t);
  const dim = t => c(DIM, t);

  const lines = [];

  // Header
  lines.push('');
  lines.push(bold(`${c(GREEN, '◆')} todo-harvest results`));
  lines.push(dim('─'.repeat(72)));

  if (entries.length === 0) {
    lines.push(`${c(GREEN, '✓')} No TODO-style comments found. Clean codebase!`);
    lines.push('');
    return lines.join('\n');
  }

  // Group by severity for sorted output
  const bySeverity = { critical: [], high: [], medium: [], low: [] };
  for (const entry of entries) {
    (bySeverity[entry.severity] || bySeverity.low).push(entry);
  }

  const severityOrder = ['critical', 'high', 'medium', 'low'];

  for (const severity of severityOrder) {
    const group = bySeverity[severity];
    if (!group.length) continue;

    const emoji = noEmoji ? '' : `${SEVERITY_EMOJI[severity]} `;
    const color = SEVERITY_COLORS[severity] || '';
    const sectionHeader = bold(c(color, `${emoji}${severity.toUpperCase()} (${group.length})`));

    lines.push('');
    lines.push(sectionHeader);
    lines.push(dim('─'.repeat(60)));

    for (const entry of group) {
      const relPath = rootDir
        ? relative(rootDir, entry.file)
        : entry.file;

      const location = c(color, `${relPath}:${entry.line}`);
      const keyword = bold(c(color, `[${entry.keyword}]`));
      const message = entry.message;

      lines.push(`  ${keyword} ${location}`);
      lines.push(`  ${dim('│')} ${message}`);

      // Git blame info
      if (entry.author) {
        const authorStr = entry.authorEmail
          ? `${entry.author} <${entry.authorEmail}>`
          : entry.author;
        const dateStr = entry.date ? ` · ${entry.date}` : '';
        const commitStr = entry.commitHash ? ` · ${entry.commitHash}` : '';
        lines.push(`  ${dim('│')} ${dim(`by ${authorStr}${dateStr}${commitStr}`)}`);
      }

      lines.push('');
    }
  }

  // Summary stats
  lines.push(dim('─'.repeat(72)));

  const counts = {
    critical: bySeverity.critical.length,
    high: bySeverity.high.length,
    medium: bySeverity.medium.length,
    low: bySeverity.low.length
  };

  const summaryParts = severityOrder
    .filter(s => counts[s] > 0)
    .map(s => {
      const color = SEVERITY_COLORS[s];
      return c(color, `${counts[s]} ${s}`);
    });

  lines.push(`${bold('Total:')} ${bold(String(entries.length))} items  ${dim('(')}${summaryParts.join(dim('  '))}${dim(')')}`);

  // CI threshold check
  if (maxTodos !== null) {
    lines.push('');
    if (entries.length > maxTodos) {
      lines.push(c(RED, `✗ CI THRESHOLD EXCEEDED: ${entries.length} todos found, max allowed is ${maxTodos}`));
      lines.push(c(RED, `  Resolve ${entries.length - maxTodos} item(s) to pass.`));
    } else {
      lines.push(c(GREEN, `✓ CI threshold OK: ${entries.length}/${maxTodos} todos`));
    }
  }

  lines.push('');
  return lines.join('\n');
}
