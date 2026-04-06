import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch {}

import { describe, test, expect, mock } from 'bun:test';
import { buildScope, JSONsx, isSignal } from '../runtime/runtime.js';

const wait = () => new Promise(r => setTimeout(r, 0));
const BASE = 'http://localhost/';

describe('buildScope', () => {
  test('loads $handlers and merges exports', async () => {
    const dataUrl = 'data:text/javascript,export default { myFn() { return 42; } }';
    const scope = await buildScope({ $handlers: dataUrl }, {}, BASE);
    expect(typeof scope['myFn']).toBe('function');
  });
});

describe('JSONsx', () => {
  test('calls onMount if present in scope', async () => {
    const target = document.createElement('div');
    const dataUrl = 'data:text/javascript,export default { onMount() { globalThis._testMounted = true; } }';
    await JSONsx({ tagName: 'div', $handlers: dataUrl }, target);
    await wait();
    expect(globalThis._testMounted).toBe(true);
    delete globalThis._testMounted;
  });

  test('fetches string source', async () => {
    const doc = { tagName: 'article' };
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(doc),
    }));
    const target = document.createElement('div');
    await JSONsx('http://example.com/test.json', target);
    expect(target.children[0].tagName.toLowerCase()).toBe('article');
  });
});
