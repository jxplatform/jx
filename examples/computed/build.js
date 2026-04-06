/**
 * build.js — Compile user-card.json into a static HTML file with hydration islands.
 *
 * Usage: bun examples/computed/build.js
 */
import { compile } from '@jsonsx/compiler';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = await compile(resolve(import.meta.dirname, 'user-card.json'), {
  title: 'JSONsx — Computed Signals',
  runtimeSrc: '../../packages/runtime/dist/runtime.js',
});

const out = resolve(import.meta.dirname, 'compiled.html');
writeFileSync(out, html, 'utf8');
console.log(`Written to ${out}`);
