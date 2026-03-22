/**
 * cli.js — Command-line interface for todo-harvest.
 *
 * Implements the full CLI using commander, including:
 *   - Directory argument (default: cwd)
 *   - --format table|json|markdown
 *   - --keywords TODO,FIXME,...
 *   - --no-blame (skip git blame)
 *   - --max N (CI threshold)
 *   - --output FILE (write to file instead of stdout)
 *   - --no-color
 *   - --extensions .js,.ts,...
 *   - --ignore node_modules,dist,...
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { harvest } from './index.js';
import { formatTable } from './formatters/table.js';
import { formatJson } from './formatters/json.js';
import { formatMarkdown } from './formatters/markdown.js';
import { DEFAULT_KEYWORDS } from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Lazy import commander (handles both bundled and unbundled scenarios)
async function getCommander() {
  try {
    const { Command } = await import('commander');
    return Command;
  } catch {
    // Fallback: minimal commander-like interface for environments
    // where commander isn't installed (rare, but safe)
    throw new Error('commander package not found. Run: npm install commander');
  }
}

export async function run() {
  const { Command } = await getCommander();
  const program = new Command();

  // Read version from package.json
  let version = '1.0.0';
  try {
    const pkg = require('../package.json');
    version = pkg.version;
  } catch {}

  program
    .name('todo-harvest')
    .description('Harvest TODO/FIXME/HACK/BUG comments from your codebase with git blame, multi-format output, and CI threshold enforcement.')
    .version(version)
    .argument('[directory]', 'Directory to scan', '.')
    .option(
      '-f, --format <type>',
      'Output format: table | json | markdown',
      'table'
    )
    .option(
      '-k, --keywords <list>',
      `Comma-separated keywords to search (default: ${DEFAULT_KEYWORDS.join(',')})`,
      DEFAULT_KEYWORDS.join(',')
    )
    .option('--no-blame', 'Skip git blame enrichment (faster for large repos)')
    .option(
      '--max <n>',
      'Fail with exit code 1 if more than N todos found (for CI)',
      parseInt
    )
    .option(
      '-o, --output <file>',
      'Write report to file instead of stdout'
    )
    .option(
      '--extensions <list>',
      'Comma-separated file extensions to scan (e.g. .js,.ts,.py)'
    )
    .option(
      '--ignore <list>',
      'Comma-separated directory/file patterns to ignore'
    )
    .option('--no-color', 'Disable color output (auto-detected if not a TTY)')
    .option(
      '--depth <n>',
      'Maximum directory depth to scan',
      parseInt,
      20
    )
    .action(async (directory, options) => {
      const rootDir = resolve(directory);
      const keywords = options.keywords.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
      const extensions = options.extensions
        ? options.extensions.split(',').map(e => e.trim()).filter(Boolean)
        : null;
      const ignorePatterns = options.ignore
        ? options.ignore.split(',').map(p => p.trim()).filter(Boolean)
        : [];
      const maxTodos = options.max !== undefined ? options.max : null;
      const noColor = !options.color || !process.stdout.isTTY;
      const useBlame = options.blame !== false;

      // Validate format
      const validFormats = ['table', 'json', 'markdown'];
      if (!validFormats.includes(options.format)) {
        console.error(`✗ Invalid format "${options.format}". Use: ${validFormats.join(', ')}`);
        process.exit(2);
      }

      try {
        // Run harvest
        const result = await harvest(rootDir, {
          keywords,
          extensions,
          ignorePatterns,
          blame: useBlame,
          maxTodos,
          maxDepth: options.depth || 20
        });

        // Format output
        let output;
        switch (options.format) {
          case 'json':
            output = formatJson(result.items, { rootDir, keywords, maxTodos, pretty: true });
            break;
          case 'markdown':
            output = formatMarkdown(result.items, { rootDir, maxTodos });
            break;
          case 'table':
          default:
            output = formatTable(result.items, { rootDir, noColor, maxTodos });
            break;
        }

        // Write output
        if (options.output) {
          await writeFile(options.output, output, 'utf8');
          if (!noColor) {
            process.stdout.write(`\x1b[32m✓\x1b[0m Report saved to ${options.output}\n`);
          } else {
            process.stdout.write(`✓ Report saved to ${options.output}\n`);
          }
        } else {
          process.stdout.write(output);
          if (!output.endsWith('\n')) process.stdout.write('\n');
        }

        // CI exit code
        if (result.ci && !result.ci.passed) {
          process.exit(1);
        }

      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(`✗ Directory not found: ${rootDir}`);
          process.exit(2);
        }
        console.error(`✗ Unexpected error: ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
        process.exit(2);
      }
    });

  await program.parseAsync(process.argv);
}
