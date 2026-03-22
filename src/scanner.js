/**
 * scanner.js — File system walker that finds candidate source files
 * and returns their paths for comment parsing.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

// Default file extensions to scan
const DEFAULT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.cpp', '.c', '.h', '.hpp', '.cs',
  '.php', '.swift', '.scala',
  '.sh', '.bash', '.zsh',
  '.css', '.scss', '.less',
  '.html', '.vue', '.svelte',
  '.yml', '.yaml', '.toml',
  '.md', '.mdx'
]);

// Directories always ignored
const ALWAYS_IGNORE = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.nyc_output', '__pycache__',
  '.pytest_cache', '.tox', 'venv', '.venv',
  '.DS_Store', 'vendor', 'bower_components',
  '.cache', '.turbo', '.vercel', '.netlify'
]);

/**
 * Recursively walk a directory and return all scannable file paths.
 *
 * @param {string} rootDir - Absolute path to the root directory
 * @param {object} options
 * @param {string[]} [options.extensions] - File extensions to include (e.g. ['.js', '.ts'])
 * @param {string[]} [options.ignorePatterns] - Directory/file name patterns to skip
 * @param {number} [options.maxDepth] - Maximum directory depth (default: 20)
 * @returns {Promise<string[]>} Array of absolute file paths
 */
export async function scanFiles(rootDir, options = {}) {
  const {
    extensions = null,
    ignorePatterns = [],
    maxDepth = 20
  } = options;

  const allowedExts = extensions
    ? new Set(extensions.map(e => e.startsWith('.') ? e : `.${e}`))
    : DEFAULT_EXTENSIONS;

  const userIgnore = new Set(ignorePatterns.map(p => p.toLowerCase()));
  const results = [];

  async function walk(dir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or broken symlink — skip silently
    }

    for (const entry of entries) {
      const name = entry.name;
      const nameLower = name.toLowerCase();
      const fullPath = join(dir, name);

      // Skip always-ignored directories
      if (entry.isDirectory()) {
        if (ALWAYS_IGNORE.has(name) || userIgnore.has(nameLower)) continue;
        await walk(fullPath, depth + 1);
        continue;
      }

      // Skip symlinks (avoid cycles)
      if (entry.isSymbolicLink()) continue;

      // Check extension
      const ext = extname(name).toLowerCase();
      if (!allowedExts.has(ext)) continue;

      // Skip user-ignored file patterns
      if (userIgnore.has(nameLower) || userIgnore.has(ext)) continue;

      results.push(fullPath);
    }
  }

  await walk(rootDir, 0);
  return results;
}

/**
 * Read a file and return its lines.
 * Returns empty array if file cannot be read.
 *
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
export async function readFileLines(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return content.split('\n');
  } catch {
    return [];
  }
}
