/**
 * compile.js — Build step for JSONsx examples
 *
 * Compiles every example's JSON descriptor to a static HTML file in dist/.
 * Each example is output to dist/<example-name>/index.html.
 * A Hono server handler is also emitted if the example has server entries.
 *
 * Usage:
 *   bun run compile
 *   node compile.js
 */

import { compile, compileServer } from '@jsonsx/compiler';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const __dir = import.meta.dir ?? dirname(new URL(import.meta.url).pathname);

/**
 * Each entry maps a human-readable name to its JSON descriptor and output path.
 * Additional compile() options (title, runtimeSrc) can be supplied per-entry.
 */
const examples = [
  {
    name:    'counter',
    src:     resolve(__dir, 'counter/counter.json'),
    out:     resolve(__dir, 'dist/counter/index.html'),
    title:   'Counter — JSONsx',
  },
  {
    name:    'todo',
    src:     resolve(__dir, 'todo/todo-app.json'),
    out:     resolve(__dir, 'dist/todo/index.html'),
    title:   'Todo App — JSONsx',
  },
  {
    name:    'form',
    src:     resolve(__dir, 'form/contact-form.json'),
    out:     resolve(__dir, 'dist/form/index.html'),
    title:   'Contact Form — JSONsx',
  },
  {
    name:    'list',
    src:     resolve(__dir, 'list/dynamic-list.json'),
    out:     resolve(__dir, 'dist/list/index.html'),
    title:   'Dynamic List — JSONsx',
  },
  {
    name:    'fetch',
    src:     resolve(__dir, 'fetch/fetch-demo.json'),
    out:     resolve(__dir, 'dist/fetch/index.html'),
    title:   'Fetch Demo — JSONsx',
  },
  {
    name:    'computed',
    src:     resolve(__dir, 'computed/user-card.json'),
    out:     resolve(__dir, 'dist/computed/index.html'),
    title:   'Computed — JSONsx',
  },
  {
    name:    'markdown',
    src:     resolve(__dir, 'markdown/blog.json'),
    out:     resolve(__dir, 'dist/markdown/index.html'),
    title:   'Blog — JSONsx',
  },
  {
    name:    'responsive',
    src:     resolve(__dir, 'responsive/responsive-card.json'),
    out:     resolve(__dir, 'dist/responsive/index.html'),
    title:   'Responsive Card — JSONsx',
  },
  {
    name:    'switch',
    src:     resolve(__dir, 'switch/router.json'),
    out:     resolve(__dir, 'dist/switch/index.html'),
    title:   'Router — JSONsx',
  },
];

// Path to the bundled runtime that will be referenced from compiled HTML.
// The dev server builds it to ../../dist/runtime.js relative to examples/.
const RUNTIME_SRC = '../../dist/runtime.js';

let ok = 0;
let fail = 0;

for (const ex of examples) {
  try {
    const [html, server] = await Promise.all([
      compile(ex.src, { title: ex.title, runtimeSrc: RUNTIME_SRC }),
      compileServer(ex.src),
    ]);

    mkdirSync(dirname(ex.out), { recursive: true });
    writeFileSync(ex.out, html, 'utf8');
    console.log(`✓  ${ex.name.padEnd(12)} → ${ex.out.replace(__dir + '/', '')}`);

    if (server) {
      const serverOut = ex.out.replace(/(\.[^.]+)?$/, '-server.js');
      writeFileSync(serverOut, server, 'utf8');
      console.log(`   ${''.padEnd(12)}   ${serverOut.replace(__dir + '/', '')}  (server handler)`);
    }

    ok++;
  } catch (err) {
    console.error(`✗  ${ex.name}: ${err.message}`);
    fail++;
  }
}

console.log(`\nCompiled ${ok} example(s)${fail ? `, ${fail} failed` : ''}.`);
if (fail) process.exit(1);
