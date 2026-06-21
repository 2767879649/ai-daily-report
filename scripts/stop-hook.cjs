// Stop hook: check for file changes and update CLAUDE.md session history.
// Runs after every turn via the Stop event. Only appends when source files changed.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const MARKER = path.join(ROOT, '.claude', '.last-stop');
const SOURCE_EXTS = ['.js', '.css', '.mjs', '.html', '.json', '.md'];
const SKIP_DIRS = new Set(['node_modules', '.claude', '.git', 'data']);

let lastRun = 0;
try { lastRun = fs.statSync(MARKER).mtimeMs; } catch (_) { /* first run */ }

function scan(dir) {
  let latest = 0;
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return latest; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (stat.isDirectory()) {
      latest = Math.max(latest, scan(full));
    } else if (SOURCE_EXTS.includes(path.extname(name)) && stat.mtimeMs > lastRun) {
      latest = Math.max(latest, stat.mtimeMs);
    }
  }
  return latest;
}

const latest = scan(ROOT);

// Update marker
fs.writeFileSync(MARKER, String(Date.now()));

if (latest <= lastRun) {
  process.exit(0);
}

// Update CLAUDE.md
const now = new Date();
const ts = now.toISOString().replace('T', ' ').slice(0, 19);
const lines = fs.readFileSync(CLAUDE_MD, 'utf8').split('\n');

// Find or create the Session History section at end of file
let historyIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].startsWith('## Session History')) {
    historyIdx = i;
    break;
  }
}

const entry = `- ${ts} — session completed with file changes`;

if (historyIdx === -1) {
  // Append new section
  if (lines[lines.length - 1] !== '') lines.push('');
  lines.push('## Session History', '', entry, '');
} else {
  // Insert after the header
  lines.splice(historyIdx + 2, 0, entry);
  // Keep at most 20 entries
  const headerLine = lines.findIndex(l => l.startsWith('## Session History'));
  let entryCount = 0;
  for (let i = headerLine + 2; i < lines.length && lines[i].startsWith('- '); i++) {
    entryCount++;
  }
  if (entryCount > 20) {
    const firstEntry = headerLine + 2;
    lines.splice(firstEntry + 20, entryCount - 20);
  }
}

fs.writeFileSync(CLAUDE_MD, lines.join('\n'));
console.log(JSON.stringify({ systemMessage: `CLAUDE.md updated with session history (${ts}).` }));
