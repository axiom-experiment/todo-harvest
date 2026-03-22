/**
 * git.js — Git blame integration for todo-harvest.
 *
 * Enriches TodoEntry objects with author, date, and commit hash from
 * `git blame --porcelain`. Gracefully handles non-git directories,
 * uncommitted files, and repositories without any history.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Check if a directory is inside a git repository.
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isGitRepo(dir) {
  try {
    await execFileAsync('git', ['-C', dir, 'rev-parse', '--git-dir'], {
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse the output of `git blame --porcelain` for a single file+line.
 *
 * Porcelain format (relevant lines):
 *   <commit-hash> <orig-line> <final-line> <num-lines>
 *   author <name>
 *   author-mail <<email>>
 *   author-time <unix-timestamp>
 *   ...
 *
 * @param {string} output - Raw porcelain blame output
 * @returns {{ author: string, authorEmail: string, date: string, commitHash: string } | null}
 */
function parsePorcelain(output) {
  const lines = output.split('\n');
  if (!lines.length) return null;

  const hashLine = lines[0].trim().split(' ');
  const commitHash = hashLine[0] || null;

  // Detect uncommitted (zero hash)
  if (commitHash && /^0+$/.test(commitHash)) {
    return {
      author: 'Uncommitted',
      authorEmail: null,
      date: null,
      commitHash: null
    };
  }

  let author = null;
  let authorEmail = null;
  let date = null;

  for (const line of lines) {
    if (line.startsWith('author ') && !line.startsWith('author-')) {
      author = line.slice(7).trim();
    } else if (line.startsWith('author-mail ')) {
      authorEmail = line.slice(12).trim().replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      const ts = parseInt(line.slice(12).trim(), 10);
      if (!isNaN(ts)) {
        date = new Date(ts * 1000).toISOString().slice(0, 10);
      }
    }
  }

  return { author, authorEmail, date, commitHash: commitHash?.slice(0, 8) || null };
}

/**
 * Enrich a batch of TodoEntry objects with git blame data.
 *
 * Groups entries by file for efficiency — runs one `git blame` per file
 * rather than per line.
 *
 * @param {import('./parser.js').TodoEntry[]} entries
 * @param {string} rootDir - Repository root
 * @param {object} options
 * @param {boolean} [options.skipGit] - Skip git blame entirely
 * @returns {Promise<import('./parser.js').TodoEntry[]>}
 */
export async function enrichWithBlame(entries, rootDir, options = {}) {
  if (options.skipGit || entries.length === 0) return entries;

  const gitAvailable = await isGitRepo(rootDir);
  if (!gitAvailable) return entries;

  // Group line numbers by file path
  const byFile = new Map();
  for (const entry of entries) {
    if (!byFile.has(entry.file)) byFile.set(entry.file, []);
    byFile.get(entry.file).push(entry);
  }

  // Process each file
  await Promise.allSettled(
    Array.from(byFile.entries()).map(async ([filePath, fileEntries]) => {
      // Collect all line numbers for this file
      const lineNumbers = fileEntries.map(e => e.line);

      // Build `-L <line>,<line>` arguments (one per unique line)
      // For efficiency, blame the whole file and cache results
      let blameOutput;
      try {
        const result = await execFileAsync(
          'git',
          ['-C', rootDir, 'blame', '--porcelain', filePath],
          { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
        );
        blameOutput = result.stdout;
      } catch {
        return; // File not tracked — leave blame fields null
      }

      // Parse porcelain into a line→blame-info map
      const lineBlameMap = parsePorcelainFull(blameOutput);

      // Enrich entries
      for (const entry of fileEntries) {
        const info = lineBlameMap.get(entry.line);
        if (info) {
          entry.author = info.author;
          entry.authorEmail = info.authorEmail;
          entry.date = info.date;
          entry.commitHash = info.commitHash;
        }
      }
    })
  );

  return entries;
}

/**
 * Parse full porcelain blame output into a Map<lineNumber, blameInfo>.
 *
 * The porcelain format groups lines: each group starts with:
 *   <hash> <orig-line> <final-line> <count>
 * followed by header lines, then the actual source line.
 *
 * @param {string} output
 * @returns {Map<number, { author, authorEmail, date, commitHash }>}
 */
function parsePorcelainFull(output) {
  const result = new Map();
  const lines = output.split('\n');

  let currentHash = null;
  let currentFinalLine = null;
  const commitCache = new Map(); // hash → { author, authorEmail, date }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Header line: <hash> <orig> <final> [<count>]
    const headerMatch = /^([0-9a-f]{40})\s+\d+\s+(\d+)/.exec(line);
    if (headerMatch) {
      currentHash = headerMatch[1];
      currentFinalLine = parseInt(headerMatch[2], 10);

      if (!commitCache.has(currentHash)) {
        commitCache.set(currentHash, { author: null, authorEmail: null, date: null });
      }
      continue;
    }

    if (!currentHash) continue;

    const entry = commitCache.get(currentHash);

    if (line.startsWith('author ') && !line.startsWith('author-')) {
      entry.author = line.slice(7).trim();
    } else if (line.startsWith('author-mail ')) {
      entry.authorEmail = line.slice(12).trim().replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      const ts = parseInt(line.slice(12).trim(), 10);
      if (!isNaN(ts)) {
        entry.date = new Date(ts * 1000).toISOString().slice(0, 10);
      }
    } else if (line.startsWith('\t')) {
      // Source line — this finalizes the current line's entry
      const isZeroHash = /^0+$/.test(currentHash);
      result.set(currentFinalLine, {
        author: isZeroHash ? 'Uncommitted' : (entry.author || 'Unknown'),
        authorEmail: isZeroHash ? null : entry.authorEmail,
        date: isZeroHash ? null : entry.date,
        commitHash: isZeroHash ? null : currentHash.slice(0, 8)
      });
    }
  }

  return result;
}
