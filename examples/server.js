/**
 * server.js — JSONsx development server with live reload
 *
 * - Watches all project files (excluding node_modules / dist / .git)
 * - Rebuilds dist/runtime.js when the runtime source changes
 * - Broadcasts a reload event via SSE to all open browser tabs
 * - Injects the SSE listener into every HTML response
 *
 * Run with: bun run dev
 */

import { watch } from 'fs';
import { MarkdownFile, MarkdownCollection } from '../packages/parser/md.js';

// ─── Build ────────────────────────────────────────────────────────────────────

async function buildRuntime() {
  const result = await Bun.build({
    entrypoints: ['./packages/runtime/runtime.js'],
    outdir:      './dist',
    target:      'browser',
    format:      'esm',
    sourcemap:   'linked',
  });
  if (!result.success) result.logs.forEach(l => console.error(l));
  return result.success;
}

async function buildStudio() {
  const result = await Bun.build({
    entrypoints: ['./packages/studio/studio.js'],
    outdir:      './dist/studio',
    target:      'browser',
    format:      'esm',
    sourcemap:   'linked',
  });
  if (!result.success) result.logs.forEach(l => console.error(l));
  return result.success;
}

await buildRuntime();
console.log('Built → dist/runtime.js');
await buildStudio();
console.log('Built → dist/studio/studio.js');

// ─── Live reload (SSE) ────────────────────────────────────────────────────────

/** @type {Set<(msg: string) => void>} */
const clients = new Set();
const encoder = new TextEncoder();

function broadcast() {
  for (const send of clients) send('data: reload\n\n');
}

// Small script injected into every HTML response
const SSE_SCRIPT = `\n<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

// ─── File watcher ─────────────────────────────────────────────────────────────

const IGNORE = ['/node_modules/', '/dist/', '/.git/', 'bun.lockb'];

let debounce = null;
watch('.', { recursive: true }, async (_, filename) => {
  if (!filename) return;
  if (IGNORE.some(p => filename.includes(p.replaceAll('/', '')))) return;

  clearTimeout(debounce);
  debounce = setTimeout(async () => {
    // Rebuild the bundle when the runtime source files change
    const isRuntime = filename.includes('runtime') || filename.endsWith('effect.js');
    const isStudio  = filename.includes('studio');
    if (isRuntime) {
      const ok = await buildRuntime();
      if (ok) console.log(`Rebuilt  → dist/runtime.js  (${filename} changed)`);
      else    return; // don't reload if build failed
    } else if (isStudio) {
      const ok = await buildStudio();
      if (ok) console.log(`Rebuilt  → dist/studio/studio.js  (${filename} changed)`);
      else    return;
    } else {
      console.log(`Changed  → ${filename}`);
    }
    broadcast();
  }, 50);
});

// ─── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: 3000,

  async fetch(req) {
    const url  = new URL(req.url);
    let path = url.pathname;
    if (path.endsWith('/')) path += 'index.html';
    else if (path === '') path = '/index.html';

    // SSE endpoint — each browser tab connects here
    if (path === '/__reload') {
      let send;
      const stream = new ReadableStream({
        start(controller) {
          send = (msg) => { try { controller.enqueue(encoder.encode(msg)); } catch {} };
          clients.add(send);
          // Send a heartbeat comment every 15 s to keep the connection alive
          const hb = setInterval(() => { try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(hb); } }, 15_000);
        },
        cancel() { clients.delete(send); },
      });
      return new Response(stream, {
        headers: {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
        },
      });
    }

    // ─── Markdown API ──────────────────────────────────────────────────────────

    if (path === '/api/markdown/posts') {
      const coll = new MarkdownCollection({
        src:       './examples/markdown/content/posts/*.md',
        sortBy:    'frontmatter.date',
        sortOrder: 'desc',
      });
      const posts = await coll.resolve();
      return new Response(JSON.stringify(posts), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/markdown/post') {
      const raw  = url.searchParams.get('slug') || 'getting-started';
      const slug = raw.replace(/[^a-z0-9_-]/gi, '-').replace(/^-+|-+$/g, '') || 'getting-started';
      const file = new MarkdownFile({
        src: `./examples/markdown/content/posts/${slug}.md`,
      });
      try {
        const post = await file.resolve();
        return new Response(JSON.stringify(post), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── Static files ─────────────────────────────────────────────────────────

    const file = Bun.file('.' + path);
    if (!await file.exists()) return new Response('Not found', { status: 404 });

    // Inject SSE script into HTML responses
    if (path.endsWith('.html')) {
      const html = await file.text();
      return new Response(
        html.includes('</body>') ? html.replace('</body>', SSE_SCRIPT + '\n</body>') : html + SSE_SCRIPT,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    return new Response(file);
  },
});

console.log(`\nhttp://localhost:${server.port}  (live reload active)`);
console.log('  /studio/              ← JSONsx Studio');
console.log('  /examples/todo/');
console.log('  /examples/counter/');
console.log('  /examples/computed/');
console.log('  /examples/list/');
console.log('  /examples/fetch/');
console.log('  /examples/form/');
console.log('  /examples/switch/');
