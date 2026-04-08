/**
 * build.js — Compile user-card.json into a static HTML file.
 *
 * Usage: bun examples/computed/build.js
 */
import { compile } from '@jsonsx/compiler';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const result = await compile(resolve(import.meta.dirname, 'user-card.json'), {
  title: 'JSONsx — Computed Signals',
});

const out = resolve(import.meta.dirname, 'compiled.html');
writeFileSync(out, result.html, 'utf8');

// Write companion JS module files
for (const f of result.files) {
  const filePath = resolve(dirname(out), f.path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, f.content, 'utf8');
  console.log(`  → ${filePath}`);
}

console.log(`Written to ${out}`);
