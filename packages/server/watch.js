/**
 * watch.js — File watcher + SSE live reload
 */

import { watch } from 'fs';
import { rebuild } from './build.js';

const DEFAULT_IGNORE = ['/node_modules/', '/dist/', '/.git/', 'bun.lockb', 'bun.lock'];

export const SSE_SCRIPT = `\n<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

export function injectSSE(html) {
  return html.includes('</body>')
    ? html.replace('</body>', SSE_SCRIPT + '\n</body>')
    : html + SSE_SCRIPT;
}

/**
 * Create the file watcher + SSE system.
 * @param {string} root - Absolute path to watch
 * @param {Array} builds - Build entries (for selective rebuild)
 * @param {{ ignore?: string[], debounce?: number }} [opts]
 * @returns {{ broadcast: () => void, handleSSE: () => Response }}
 */
export function createWatcher(root, builds, opts = {}) {
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  const debounceMs = opts.debounce ?? 50;

  /** @type {Set<(msg: string) => void>} */
  const clients = new Set();
  const encoder = new TextEncoder();

  function broadcast() {
    for (const send of clients) send('data: reload\n\n');
  }

  function handleSSE() {
    let send;
    const stream = new ReadableStream({
      start(c) {
        send = (msg) => { try { c.enqueue(encoder.encode(msg)); } catch {} };
        clients.add(send);
        const hb = setInterval(() => {
          try { c.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(hb); }
        }, 15_000);
      },
      cancel() { clients.delete(send); },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  }

  let timer = null;
  watch(root, { recursive: true }, (_, filename) => {
    if (!filename) return;
    if (ignore.some(p => filename.includes(p.replaceAll('/', '')))) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (builds.length > 0) {
        const result = await rebuild(builds, filename);
        if (!result.success) return;
        if (result.rebuilt.length > 0) { broadcast(); return; }
      }
      console.log(`Changed  → ${filename}`);
      broadcast();
    }, debounceMs);
  });

  return { broadcast, handleSSE };
}
