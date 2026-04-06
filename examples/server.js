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
import { resolve, relative } from 'node:path';

// Absolute path to the project root (one level above examples/)
const PROJECT_ROOT = resolve(import.meta.dir, '..');

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

    // ─── Generic server-side prototype proxy ───────────────────────────────────
    // Handles $prototype + $src entries whose modules can't run in the browser.
    // The runtime falls back here when import() fails (e.g. Node-only modules).

    if (path === '/__jsonsx_resolve__' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return new Response('Invalid JSON body', { status: 400 }); }

      const { $src, $prototype, $export: xport, $base, ...config } = body;
      if (!$src) return new Response('Missing $src', { status: 400 });

      // Resolve $src to an absolute path using the document's URL as the base
      let moduleAbsPath;
      try {
        if ($base) {
          const docUrlPath = new URL($base).pathname;                       // /examples/markdown/blog.json
          const docDir     = docUrlPath.slice(0, docUrlPath.lastIndexOf('/') + 1); // /examples/markdown/
          const docAbsDir  = resolve(PROJECT_ROOT, '.' + docDir);
          moduleAbsPath    = resolve(docAbsDir, $src);
        } else {
          moduleAbsPath = resolve(PROJECT_ROOT, $src);
        }
      } catch (e) {
        return new Response(`Cannot resolve $src "${$src}": ${e.message}`, { status: 400 });
      }

      // Rebase any relative string config values from doc-relative to CWD-relative
      // so the class receives paths it can resolve from the server's working directory.
      if ($base) {
        const docUrlPath = new URL($base).pathname;
        const docDir     = docUrlPath.slice(0, docUrlPath.lastIndexOf('/') + 1);
        const docAbsDir  = resolve(PROJECT_ROOT, '.' + docDir);
        for (const [k, v] of Object.entries(config)) {
          if (typeof v === 'string' && (v.startsWith('./') || v.startsWith('../'))) {
            config[k] = './' + relative(process.cwd(), resolve(docAbsDir, v));
          }
        }
      }

      let mod;
      try {
        mod = await import(moduleAbsPath);
      } catch (e) {
        return new Response(`Failed to import "${$src}": ${e.message}`, { status: 500 });
      }

      const exportName  = xport ?? $prototype;
      const ExportedClass = mod[exportName] ?? mod.default?.[exportName];
      if (typeof ExportedClass !== 'function') {
        return new Response(`Export "${exportName}" not found in "${$src}"`, { status: 500 });
      }

      try {
        const instance = new ExportedClass(config);
        const value = typeof instance.resolve === 'function'
          ? await instance.resolve()
          : ('value' in instance ? instance.value : instance);
        return new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
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
