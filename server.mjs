import { createServer } from 'node:http';
import { readFile, writeFile, rename, access, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import RssParser from 'rss-parser';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = join(__dirname, 'data');
const PUBLIC_DIR = join(__dirname, 'public');
const ARTICLES_FILE = join(DATA_DIR, 'articles.json');
const BOOKMARKS_FILE = join(DATA_DIR, 'bookmarks.json');
const FEEDS_FILE = join(DATA_DIR, 'feeds.json');
const MAX_ARTICLES_DAYS = 7;

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AI-Daily-Report/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

// Validate feed URL to prevent SSRF
function isValidFeedUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return false; }
  const blocked = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]'];
  if (blocked.includes(hostname)) return false;
  if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('169.254.')) return false;
  if (hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)) return false;
  return true;
}

// Write lock queue for bookmark operations (prevents read-modify-write races)
let writeLock = Promise.resolve();
function withLock(fn) {
  const prev = writeLock;
  let resolveLock;
  writeLock = new Promise(r => { resolveLock = r; });
  return prev.then(() => fn().finally(resolveLock));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Data helpers ---

async function ensureDataDir() {
  try { await access(DATA_DIR); } catch { await mkdir(DATA_DIR, { recursive: true }); }
}

async function readJSON(filepath, fallback = []) {
  try {
    const raw = await readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJSON(filepath, data) {
  const tmp = filepath + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, filepath);
}

// --- Article helpers ---

function articleIdFromItem(item) {
  const key = item.link || item.guid || (item.title + (item.isoDate || ''));
  return createHash('md5').update(key).digest('hex').slice(0, 12);
}

function cleanSummary(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function normalizeDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function dateKey(isoString) {
  return isoString.slice(0, 10);
}

async function cleanupOldArticles() {
  const articles = await readJSON(ARTICLES_FILE);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_ARTICLES_DAYS);
  const cutoffKey = dateKey(cutoff.toISOString());
  const fresh = articles.filter(a => dateKey(a.publishedAt) >= cutoffKey);
  if (fresh.length < articles.length) {
    await writeJSON(ARTICLES_FILE, fresh);
    console.log(`Cleaned up ${articles.length - fresh.length} old articles`);
  }
  return fresh;
}

// --- RSS Fetching ---

async function fetchAllFeeds() {
  const feeds = await readJSON(FEEDS_FILE);
  const existing = await readJSON(ARTICLES_FILE);
  const existingIds = new Set(existing.map(a => a.id));
  let newCount = 0;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        if (!isValidFeedUrl(feed.url)) {
          throw new Error(`Blocked URL: ${feed.url}`);
        }
        const parsed = await rssParser.parseURL(feed.url);
        const articles = (parsed.items || []).map(item => ({
          id: articleIdFromItem(item),
          title: (item.title || '').trim(),
          link: item.link || '',
          sourceId: feed.id,
          sourceName: feed.name,
          summary: cleanSummary(item.contentSnippet || item.content || item.summary || ''),
          publishedAt: normalizeDate(item.isoDate || item.pubDate),
          fetchedAt: new Date().toISOString(),
          lang: feed.lang,
        }));
        return { feed: feed.name, articles, ok: true };
      } catch (err) {
        console.error(`Failed to fetch ${feed.name}:`, err.message);
        return { feed: feed.name, articles: [], ok: false, error: err.message };
      }
    })
  );

  const allNew = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok) {
      for (const article of result.value.articles) {
        if (!existingIds.has(article.id)) {
          allNew.push(article);
          existingIds.add(article.id);
        }
      }
    }
  }

  if (allNew.length > 0) {
    const merged = [...existing, ...allNew];
    await writeJSON(ARTICLES_FILE, merged);
  }

  return {
    newCount: allNew.length,
    totalArticles: existing.length + allNew.length,
    results: results.map(r =>
      r.status === 'fulfilled'
        ? { feed: r.value.feed, count: r.value.articles.length, ok: r.value.ok }
        : { feed: 'unknown', count: 0, ok: false, error: r.reason?.message }
    ),
  };
}

// --- API Router ---

async function handleAPI(pathname, method, body, searchParams) {
  // GET /api/health
  if (pathname === '/api/health' && method === 'GET') {
    return { status: 200, body: { status: 'ok', uptime: process.uptime() } };
  }

  // GET /api/feeds
  if (pathname === '/api/feeds' && method === 'GET') {
    const feeds = await readJSON(FEEDS_FILE);
    return { status: 200, body: feeds };
  }

  // POST /api/refresh
  if (pathname === '/api/refresh' && method === 'POST') {
    await cleanupOldArticles();
    const result = await fetchAllFeeds();
    return { status: 200, body: result };
  }

  // GET /api/articles?date=YYYY-MM-DD
  if (pathname === '/api/articles' && method === 'GET') {
    const date = searchParams?.get('date') || null;
    return { status: 200, body: await handleArticles(date) };
  }

  // GET /api/bookmarks
  if (pathname === '/api/bookmarks' && method === 'GET') {
    const bookmarks = await readJSON(BOOKMARKS_FILE);
    return { status: 200, body: bookmarks };
  }

  // POST /api/bookmarks
  if (pathname === '/api/bookmarks' && method === 'POST') {
    const result = await handleCreateBookmark(body);
    return { status: result.status || 200, body: result };
  }

  // PATCH /api/bookmarks/:id
  const bookmarkIdMatch = pathname.match(/^\/api\/bookmarks\/([a-f0-9-]{36})$/);
  if (bookmarkIdMatch && method === 'PATCH') {
    const result = await handleUpdateBookmark(bookmarkIdMatch[1], body);
    return { status: result.status || 200, body: result };
  }

  // DELETE /api/bookmarks/:id
  const deleteIdMatch = pathname.match(/^\/api\/bookmarks\/([a-f0-9-]+)$/);
  if (deleteIdMatch && method === 'DELETE') {
    const result = await handleDeleteBookmark(deleteIdMatch[1]);
    return { status: result.status || 200, body: result };
  }

  return { status: 404, body: { error: 'Not found' } };
}

async function handleArticles(date) {
  let articles = await readJSON(ARTICLES_FILE);
  if (articles.length === 0) {
    await cleanupOldArticles();
    await fetchAllFeeds();
    articles = await readJSON(ARTICLES_FILE);
  }
  if (date) {
    articles = articles.filter(a => dateKey(a.publishedAt) === date);
  }
  return articles;
}

async function handleCreateBookmark(body) {
  return withLock(async () => {
    const bookmarks = await readJSON(BOOKMARKS_FILE);
    const newBM = {
      id: randomUUID(),
      articleId: body.articleId || '',
      title: body.title || '',
      link: body.link || '',
      sourceName: body.sourceName || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      note: (body.note || '').slice(0, 500),
      bookmarkedAt: new Date().toISOString(),
    };
    bookmarks.push(newBM);
    await writeJSON(BOOKMARKS_FILE, bookmarks);
    return { status: 201, body: newBM };
  });
}

async function handleUpdateBookmark(id, body) {
  return withLock(async () => {
    const bookmarks = await readJSON(BOOKMARKS_FILE);
    const idx = bookmarks.findIndex(b => b.id === id);
    if (idx === -1) return { status: 404, body: { error: 'Bookmark not found' } };
    if (body.tags !== undefined) bookmarks[idx].tags = body.tags;
    if (body.note !== undefined) bookmarks[idx].note = body.note.slice(0, 500);
    await writeJSON(BOOKMARKS_FILE, bookmarks);
    return { status: 200, body: bookmarks[idx] };
  });
}

async function handleDeleteBookmark(id) {
  return withLock(async () => {
    const bookmarks = await readJSON(BOOKMARKS_FILE);
    const filtered = bookmarks.filter(b => b.id !== id);
    if (filtered.length === bookmarks.length) return { status: 404, body: { error: 'Bookmark not found' } };
    await writeJSON(BOOKMARKS_FILE, filtered);
    return { status: 200, body: { deleted: true } };
  });
}

// --- Static file server ---

async function serveStatic(pathname) {
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  // Strip leading slash for cross-platform path joining
  const safePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const filePath = join(PUBLIC_DIR, safePath);

  // Security: prevent path traversal using realpath
  const { realpath } = await import('node:fs/promises');
  try {
    const resolved = await realpath(filePath);
    if (!resolved.startsWith(PUBLIC_DIR)) {
      return { status: 403, body: 'Forbidden', contentType: 'text/plain' };
    }
  } catch {
    return { status: 404, body: 'Not found', contentType: 'text/plain' };
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    return {
      status: 200,
      body: content,
      contentType: MIME[ext] || 'application/octet-stream',
      isBinary: ['.png', '.ico', '.svg'].includes(ext),
    };
  } catch {
    return { status: 404, body: 'Not found', contentType: 'text/plain' };
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const MAX_BODY = 1 * 1024 * 1024; // 1MB
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', () => reject(new Error('Request error')));
  });
}

// --- Main server ---

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // API routes
    if (pathname.startsWith('/api/')) {
      const body = (method === 'POST' || method === 'PATCH')
        ? await parseBody(req).catch(err => ({ _parseError: err.message }))
        : {};
      if (body._parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: body._parseError }));
        return;
      }
      const result = await handleAPI(pathname, method, body, url.searchParams);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.body));
      return;
    }

    // Static files
    const staticResult = await serveStatic(pathname);
    const headers = { 'Content-Type': staticResult.contentType };
    res.writeHead(staticResult.status, headers);
    res.end(staticResult.isBinary ? staticResult.body : staticResult.body);
  } catch (err) {
    console.error('Server error:', IS_PRODUCTION ? err.message : err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Request timeouts to prevent Slowloris
server.timeout = 30000;
server.headersTimeout = 10000;

await ensureDataDir();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📰 AI 灵感日报 → http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
