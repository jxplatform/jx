/**
 * jsonsx-compiler.js — Static HTML emitter + custom element compiler
 * @version 2.0.0
 * @license MIT
 *
 * Usage (Node.js build step):
 *   node jsonsx-compiler.js <source.json> [output.html]
 *   node jsonsx-compiler.js todo-app.json > dist/todo-app.html
 *
 * Output tiers:
 *   Fully static subtree           → plain HTML, zero JS
 *   Dynamic subtree                → auto-generated custom element module
 *   timing: "server" entries       → generated Hono server handler
 *
 * Static detection uses the five-shape $defs grammar:
 *   - Naked values / expanded signals / template strings → dynamic (signals)
 *   - $prototype entries → dynamic (external class or Function)
 *   - Pure type defs (schema keywords only, no default) → static
 *   - ${} template strings in properties → dynamic
 *   - timing: "server" + $src + $export (no $prototype) → dynamic (server RPC)
 *
 * The compiler has zero novel static-analysis logic for JS — it reads only JSON.
 * The JSON IS the bundle manifest.
 */

import $RefParser from "@apidevtools/json-schema-ref-parser";
import { readFileSync } from "node:fs";
import { camelToKebab, toCSSText, RESERVED_KEYS } from "@jsonsx/runtime";

// ─── Entry ────────────────────────────────────────────────────────────────────

/**
 * Compile a JSONsx document to HTML (+ optional JS module files).
 *
 * - Fully static documents produce a single HTML string with zero JS.
 * - Dynamic documents are compiled as auto-generated custom elements:
 *   the HTML page contains an import map + custom element tag, and
 *   the JS is emitted as external .js module file(s).
 *
 * @param {string | object} sourcePath - Path to .json file, URL, or raw object
 * @param {object}          [opts]
 * @param {string}          [opts.title='JSONsx App'] - HTML document title
 * @param {string}          [opts.reactivitySrc] - CDN URL for @vue/reactivity
 * @param {string}          [opts.litHtmlSrc] - CDN URL for lit-html
 * @returns {Promise<{ html: string, files: Array<{ path: string, content: string, tagName?: string }> }>}
 *
 * @example
 * const { html, files } = await compile('./counter.json', { title: 'Counter' });
 * writeFileSync('dist/index.html', html);
 * for (const f of files) writeFileSync(`dist/${f.path}`, f.content);
 */
export async function compile(sourcePath, opts = {}) {
  const {
    title = "JSONsx App",
    reactivitySrc = "https://esm.sh/@vue/reactivity@3.5.32",
    litHtmlSrc = "https://esm.sh/lit-html@3.3.0",
  } = opts;

  // Dereferenced doc for static analysis (isDynamic, compileStyles, etc.)
  const doc = await $RefParser.dereference(sourcePath);

  // Raw JSON preserves internal $ref pointers
  const raw =
    typeof sourcePath === "string" ? JSON.parse(readFileSync(sourcePath, "utf8")) : sourcePath;

  const hasDynamic = isDynamic(raw);

  if (hasDynamic) {
    // ── Dynamic document: compile as an auto-generated custom element ──
    const tagName = titleToTagName(title);
    const className = tagNameToClassName(tagName);

    // Ensure the raw definition has the custom element tagName for emitElementModule
    const elementDef = { ...raw, tagName };

    const moduleContent = emitElementModule(elementDef, className, []);
    const moduleFile = { path: `${tagName}.js`, content: moduleContent, tagName };

    const styleBlock = compileStyles(raw, raw.$media ?? {});

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <script type="importmap">
  {
    "imports": {
      "@vue/reactivity": "${reactivitySrc}",
      "lit-html": "${litHtmlSrc}"
    }
  }
  </script>
  ${styleBlock}
</head>
<body>
  <${tagName}></${tagName}>
  <script type="module" src="./${tagName}.js"></script>
</body>
</html>`;

    return { html, files: [moduleFile] };
  }

  // ── Fully static document (may have dynamic child subtrees) ──
  const rootContext = createCompileContext(raw, null, raw.$defs ?? {}, raw.$media ?? {});
  const styleBlock = compileStyles(raw, raw.$media ?? {});
  const islands = [];
  const bodyContent = compileNode(raw, false, raw, rootContext, islands);

  // If any dynamic child subtrees were found, compile them as custom elements
  const files = [];
  let importMap = "";
  let moduleScripts = "";
  if (islands.length > 0) {
    for (const island of islands) {
      const moduleContent = emitElementModule(island.def, island.className, []);
      files.push({ path: `_islands/${island.tagName}.js`, content: moduleContent, tagName: island.tagName });
    }
    importMap = `<script type="importmap">
  {
    "imports": {
      "@vue/reactivity": "${reactivitySrc}",
      "lit-html": "${litHtmlSrc}"
    }
  }
  </script>`;
    moduleScripts = files.map(f =>
      `<script type="module" src="./${f.path}"></script>`
    ).join("\n  ");
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${importMap}
  ${styleBlock}
</head>
<body>
  ${bodyContent}
  ${moduleScripts}
</body>
</html>`;

  return { html, files };
}

// ─── Server handler compilation ───────────────────────────────────────────────

/**
 * Compile a JSONsx document to a Hono server handler file.
 * The handler exposes each `timing: "server"` entry as a POST endpoint under
 * `/_jsonsx/server/$export`. Returns null if no server entries are found.
 *
 * @param {string | object} sourcePath - Path to .json file, URL, or raw object
 * @param {object}          [opts]
 * @param {string}          [opts.baseUrl='/_jsonsx/server'] - Base path for server endpoints
 * @returns {Promise<string | null>} Hono server handler source string, or null
 *
 * @example
 * const server = await compileServer('./dashboard.json');
 * if (server) fs.writeFileSync('dist/server.js', server);
 */
export async function compileServer(sourcePath, opts = {}) {
  const { baseUrl = "/_jsonsx/server" } = opts;
  const doc = await $RefParser.dereference(sourcePath);
  const entries = collectServerEntries(doc);
  if (entries.length === 0) return null;

  const imports = entries
    .map(({ exportName, src }) => `import { ${exportName} } from '${src}'`)
    .join("\n");

  const routes = entries
    .map(
      ({ exportName }) => `
app.post('${baseUrl}/${exportName}', async (c) => {
  const args = await c.req.json().catch(() => ({}))
  return c.json(await ${exportName}(args))
})`,
    )
    .join("\n");

  return `// Generated by @jsonsx/compiler — do not edit manually
// Deploy as a Cloudflare Worker, Node server, or Bun process.
// Requires: npm install hono

import { Hono } from 'hono'
${imports}

const app = new Hono()
${routes}

export default app
`;
}

// ─── Static detection (§16.1) ─────────────────────────────────────────────────

/**
 * Schema-only keywords used to detect pure type definitions (Shape 2b).
 * An object with ONLY these keys and no `default` is a type def, not a signal.
 */
const SCHEMA_KEYWORDS = new Set([
  "type",
  "enum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "items",
  "properties",
  "required",
  "description",
  "title",
  "$comment",
]);

/**
 * Returns true if an object contains only schema keywords (no `default`, no `$prototype`).
 */
function isSchemaOnly(obj) {
  for (const k of Object.keys(obj)) {
    if (!SCHEMA_KEYWORDS.has(k)) return false;
  }
  return true;
}

/**
 * Returns true if a string contains a ${} template expression.
 */
function isTemplateString(val) {
  return typeof val === "string" && val.includes("${");
}

/**
 * Determine whether a node (or any of its descendants) requires client-side
 * JavaScript. A node is static if and only if its $defs contain no signals,
 * no template strings, no functions, no external classes; it has no $switch,
 * no array prototype children, no $ref bindings, and no ${} in properties.
 *
 * Five-shape detection for $defs:
 *   - string/number/boolean/null/array → dynamic (Signal.State)
 *   - string with ${} → dynamic (Signal.Computed)
 *   - object with $prototype → dynamic
 *   - object with "default" → dynamic (Signal.State)
 *   - object with schema keywords only → static (pure type def)
 *   - plain object → dynamic (Signal.State)
 *
 * @param {object} def - JSONsx element definition
 * @returns {boolean}
 */
export function isDynamic(def) {
  if (!def || typeof def !== "object") return false;

  if (def.$defs) {
    for (const d of Object.values(def.$defs)) {
      // Non-object values are always signals → dynamic
      if (typeof d !== "object" || d === null || Array.isArray(d)) return true;
      // Object with $prototype → dynamic (Function or external class)
      if (d.$prototype) return true;
      // Object with default → dynamic (expanded signal)
      if ("default" in d) return true;
      // Object with only schema keywords → static (pure type def, skip)
      if (isSchemaOnly(d)) continue;
      // Plain object → dynamic (Signal.State)
      return true;
    }
  }

  if (def.$switch) return true;
  if (def.children?.$prototype === "Array") return true;

  if (Array.isArray(def.children)) {
    if (def.children.some(isDynamic)) return true;
  }

  for (const [key, val] of Object.entries(def)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (val !== null && typeof val === "object" && typeof val.$ref === "string") return true;
    if (isTemplateString(val)) return true;
  }

  // Check for ${} in style values
  if (def.style && typeof def.style === "object") {
    for (const val of Object.values(def.style)) {
      if (isTemplateString(val)) return true;
    }
  }

  // Check for ${} in attribute values
  if (def.attributes && typeof def.attributes === "object") {
    for (const val of Object.values(def.attributes)) {
      if (isTemplateString(val)) return true;
    }
  }

  return false;
}

/**
 * Shallow variant of isDynamic — checks only this node's own properties,
 * not its children. Used at compile() root so a static parent with dynamic
 * children emits plain HTML at the root while children become islands.
 *
 * @param {object} def
 * @returns {boolean}
 */
/**
 * Shallow variant of isDynamic — checks only this node's own properties,
 * not its children. Returns true only if THIS node has dynamic bindings
 * in its own attributes/textContent/event handlers, NOT just for the
 * presence of $defs (which may be used by descendant nodes only).
 *
 * @param {object} def
 * @returns {boolean}
 */
function isNodeDynamic(def) {
  if (!def || typeof def !== "object") return false;

  // $defs alone don't make a node dynamic; only if THIS node uses them
  // (checked via $ref and template string checks below)

  if (def.$switch) return true;
  if (def.children?.$prototype === "Array") return true;

  // Check if this node's own properties reference or use dynamic values
  for (const [key, val] of Object.entries(def)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (val !== null && typeof val === "object" && typeof val.$ref === "string") return true;
    if (isTemplateString(val)) return true;
  }

  if (def.style && typeof def.style === "object") {
    for (const val of Object.values(def.style)) {
      if (isTemplateString(val)) return true;
    }
  }

  if (def.attributes && typeof def.attributes === "object") {
    for (const val of Object.values(def.attributes)) {
      if (isTemplateString(val)) return true;
    }
  }

  return false;
}

/**
 * Returns true if any node in the tree will be emitted as a hydration island.
 *
 * @param {object} def
 * @returns {boolean}
 */
function hasAnyIsland(def) {
  if (!def || typeof def !== "object") return false;
  if (isDynamic(def)) return true;
  if (Array.isArray(def.children)) return def.children.some(hasAnyIsland);
  return false;
}

// ─── Node compilation ─────────────────────────────────────────────────────────

/**
 * Compile a single JSONsx node to an HTML string.
 * Dynamic nodes become hydration islands; static nodes become plain HTML.
 *
 * @param {object}  def     - Element definition (dereferenced, for static analysis)
 * @param {boolean} dynamic - Whether this node is dynamic
 * @param {object}  [raw]   - Raw definition with $ref pointers preserved (for island embedding)
 * @returns {string} HTML string
 */
function compileNode(def, dynamic, raw, context, islands = []) {
  const nextContext = createCompileContext(
    raw,
    context.scope,
    raw?.$defs ?? context.scopeDefs,
    raw?.$media ?? context.media,
  );

  if (dynamic) {
    // Compile dynamic subtree as an auto-generated custom element
    const n = islands.length;
    const tagName = `jsonsx-island-${n}`;
    const className = `JsonsxIsland${n}`;
    const elementDef = { ...(raw ?? def), tagName };
    islands.push({ def: elementDef, tagName, className });
    return `<${tagName}></${tagName}>`;
  }

  const tag = def.tagName ?? "div";
  const attrs = buildAttrs(def, nextContext.scope);
  const inner = buildInner(def, raw, nextContext, islands);

  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/**
 * Build an HTML attribute string from a static element definition.
 *
 * @param {object} def
 * @returns {string}
 */
function buildAttrs(def, scope) {
  let out = "";

  const id = resolveStaticValue(def.id, scope);
  const className = resolveStaticValue(def.className, scope);
  const hidden = resolveStaticValue(def.hidden, scope);
  const tabIndex = resolveStaticValue(def.tabIndex, scope);
  const title = resolveStaticValue(def.title, scope);
  const lang = resolveStaticValue(def.lang, scope);
  const dir = resolveStaticValue(def.dir, scope);

  if (id) out += ` id="${escapeHtml(id)}"`;
  if (className) out += ` class="${escapeHtml(className)}"`;
  if (hidden) out += " hidden";
  if (tabIndex !== undefined && tabIndex !== null)
    out += ` tabindex="${escapeHtml(String(tabIndex))}"`;
  if (title) out += ` title="${escapeHtml(title)}"`;
  if (lang) out += ` lang="${escapeHtml(lang)}"`;
  if (dir) out += ` dir="${escapeHtml(dir)}"`;

  // Inline style (static, no nested selectors)
  if (def.style) {
    const inline = Object.entries(def.style)
      .filter(
        ([k, v]) =>
          !k.startsWith(":") &&
          !k.startsWith(".") &&
          !k.startsWith("&") &&
          !k.startsWith("[") &&
          !k.startsWith("@") &&
          v !== null &&
          typeof v !== "object",
      )
      .map(([k, v]) => {
        const value = resolveStaticValue(v, scope);
        return value == null ? null : `${camelToKebab(k)}: ${value}`;
      })
      .filter(Boolean)
      .join("; ");
    if (inline) out += ` style="${inline}"`;
  }

  // Custom attributes
  if (def.attributes) {
    for (const [k, v] of Object.entries(def.attributes)) {
      const value = resolveStaticValue(v, scope);
      if (
        value !== null &&
        value !== undefined &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      ) {
        out += ` ${k}="${escapeHtml(String(value))}"`;
      }
    }
  }

  return out;
}

/**
 * Build the inner HTML (textContent or children) for a node.
 * For children, emit islands only for those that are actually dynamic.
 *
 * @param {object} def - Dereferenced definition
 * @param {object} [raw] - Raw definition with $ref pointers preserved
 * @returns {string}
 */
function buildInner(def, raw, context, islands = []) {
  const source = raw ?? def;

  if (source.textContent !== undefined) {
    const value = resolveStaticValue(source.textContent, context.scope);
    return value == null ? "" : escapeHtml(String(value));
  }
  if (source.innerHTML) return resolveStaticValue(source.innerHTML, context.scope) ?? "";
  if (Array.isArray(source.children)) {
    const rawChildren = raw?.children;
    return source.children
      .map((c, i) => {
        const childDynamic = isNodeDynamic(c);
        const childRaw = rawChildren?.[i] ?? c;
        if (childDynamic) {
          return compileNode(c, true, childRaw, context, islands);
        }
        return compileNode(c, false, childRaw, context, islands);
      })
      .join("\n  ");
  }
  return "";
}

// ─── Style extraction (§16.4) ─────────────────────────────────────────────────

/**
 * Walk the entire document tree and collect all static nested CSS rules into a
 * single `<style>` block for the document `<head>`.
 * Static inline styles are emitted as HTML style attributes, not here.
 *
 * @param {object} doc - Root document
 * @returns {string} `<style>` HTML string, or empty string if no rules
 */
function compileStyles(doc, mediaQueries = {}) {
  const rules = [];
  // If the root itself is a dynamic island, the runtime handles all styling
  if (!isNodeDynamic(doc)) {
    collectStyles(doc, rules, mediaQueries, "");
  }
  if (rules.length === 0) return "";
  return `<style>\n${rules.join("\n")}\n</style>`;
}

/**
 * Recursively collect nested CSS rules from style definitions.
 *
 * @param {object}   def            - Element definition
 * @param {string[]} rules          - Accumulator for CSS rule strings
 * @param {string}   [parentSel=''] - Inherited CSS selector context
 */
function collectStyles(def, rules, mediaQueries, _parentSel = "") {
  if (!def || typeof def !== "object") return;

  const selector = def.id
    ? `#${def.id}`
    : def.className
      ? `.${def.className.split(" ")[0]}`
      : (def.tagName ?? "*");

  if (def.style) {
    for (const [prop, val] of Object.entries(def.style)) {
      if (prop.startsWith("@")) {
        const query = prop.startsWith("@--")
          ? (mediaQueries[prop.slice(1)] ?? prop.slice(1))
          : prop.slice(1);
        rules.push(`@media ${query} { ${selector} { ${toCSSText(val)} } }`);
        for (const [sel, nestedRules] of Object.entries(val)) {
          if (!(sel.startsWith(":") || sel.startsWith(".") || sel.startsWith("&") || sel.startsWith("["))) continue;
          const resolved = sel.startsWith("&") ? sel.replace("&", selector) : `${selector}${sel}`;
          rules.push(`@media ${query} { ${resolved} { ${toCSSText(nestedRules)} } }`);
        }
      } else if (
        prop.startsWith(":") ||
        prop.startsWith(".") ||
        prop.startsWith("&") ||
        prop.startsWith("[")
      ) {
        const resolved = prop.startsWith("&") ? prop.replace("&", selector) : `${selector}${prop}`;
        rules.push(`${resolved} { ${toCSSText(val)} }`);
      }
    }
  }

  if (Array.isArray(def.children)) {
    def.children.forEach((c) => {
      // Skip dynamic subtrees — the runtime generates scoped styles at hydration time
      if (!hasAnyIsland(c)) collectStyles(c, rules, mediaQueries, selector);
    });
  }
}

function createCompileContext(raw, parentScope = null, scopeDefs = {}, media = {}) {
  const scope = raw?.$defs
    ? buildInitialScope(raw.$defs, parentScope)
    : (parentScope ?? Object.create(null));
  return { scope, scopeDefs, media };
}

function buildInitialScope(defs = {}, parentScope = null) {
  const scope = Object.create(parentScope ?? null);

  for (const [key, def] of Object.entries(defs)) {
    if (typeof def !== "object" || def === null || Array.isArray(def)) {
      setOwnScopeValue(scope, key, cloneValue(def));
      continue;
    }
    if ("default" in def) {
      setOwnScopeValue(scope, key, cloneValue(def.default));
      continue;
    }
    if (!def.$prototype && !isSchemaOnly(def)) {
      setOwnScopeValue(scope, key, cloneValue(def));
    }
  }

  for (const [key, def] of Object.entries(defs)) {
    if (typeof def === "string" && isTemplateString(def)) {
      defineLazyScopeValue(scope, key, () => evaluateStaticTemplate(def, scope));
      continue;
    }
    if (!def || typeof def !== "object") continue;
    if (def.$prototype === "Function") {
      if (def.body) {
        const fn = new Function("$defs", ...(def.arguments ?? []), def.body);
        if (def.signal) {
          defineLazyScopeValue(scope, key, () => fn(scope));
        } else {
          setOwnScopeValue(scope, key, fn);
        }
      } else if (!def.signal) {
        setOwnScopeValue(scope, key, () => {});
      }
      continue;
    }
    if (def.$prototype === "LocalStorage" || def.$prototype === "SessionStorage") {
      setOwnScopeValue(scope, key, cloneValue(def.default ?? null));
    }
  }

  return scope;
}

function setOwnScopeValue(scope, key, value) {
  Object.defineProperty(scope, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function defineLazyScopeValue(scope, key, getter) {
  Object.defineProperty(scope, key, {
    enumerable: true,
    configurable: true,
    get: getter,
  });
}

function resolveStaticValue(value, scope) {
  if (isRefObject(value)) return resolveRefValue(value.$ref, scope);
  if (isTemplateString(value)) return evaluateStaticTemplate(value, scope);
  return value;
}

function isRefObject(value) {
  return value !== null && typeof value === "object" && typeof value.$ref === "string";
}

function resolveRefValue(refValue, scope) {
  if (typeof refValue !== "string") return refValue;
  if (refValue.startsWith("$map/")) {
    const parts = refValue.split("/");
    const key = parts[1];
    const base = scope.$map?.[key] ?? scope["$map/" + key];
    return parts.length > 2 ? getPathValue(base, parts.slice(2).join("/")) : base;
  }
  if (refValue.startsWith("#/$defs/")) {
    const sub = refValue.slice("#/$defs/".length);
    const slash = sub.indexOf("/");
    if (slash < 0) return scope[sub];
    return getPathValue(scope[sub.slice(0, slash)], sub.slice(slash + 1));
  }
  return scope[refValue] ?? null;
}

function evaluateStaticTemplate(str, scope) {
  const fn = new Function("$defs", "$map", `return \`${str}\``);
  return fn(scope, scope?.$map);
}

function getPathValue(base, path) {
  if (!path) return base;
  return path.split("/").reduce((acc, key) => (acc == null ? undefined : acc[key]), base);
}

function cloneValue(value) {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Recursively collect unique $src values from $prototype: "Function" entries.
 *
 * @param {object} doc - Document or subtree
 * @returns {string[]} Unique $src paths
 */
function collectSrcImports(doc) {
  const srcs = new Set();
  _walkSrc(doc, srcs);
  return [...srcs];
}

function _walkSrc(def, srcs) {
  if (!def || typeof def !== "object") return;
  if (def.$defs) {
    for (const d of Object.values(def.$defs)) {
      if (d && typeof d === "object" && d.$prototype === "Function" && d.$src) {
        srcs.add(d.$src);
      }
    }
  }
  if (Array.isArray(def.children)) {
    def.children.forEach((c) => _walkSrc(c, srcs));
  }
}

/**
 * Recursively collect all `timing: "server"` entries from the document tree.
 * Returns unique entries keyed by export name (last definition wins on conflict).
 *
 * @param {object} doc - Document or subtree
 * @returns {{ key: string, exportName: string, src: string }[]}
 */
function collectServerEntries(doc) {
  const entries = new Map();
  _walkServerEntries(doc, entries);
  return [...entries.values()];
}

function _walkServerEntries(def, entries) {
  if (!def || typeof def !== "object") return;
  if (def.$defs) {
    for (const [key, d] of Object.entries(def.$defs)) {
      if (
        d &&
        typeof d === "object" &&
        d.timing === "server" &&
        d.$src &&
        d.$export &&
        !d.$prototype
      ) {
        entries.set(d.$export, { key, exportName: d.$export, src: d.$src });
      }
    }
  }
  if (Array.isArray(def.children)) {
    def.children.forEach((c) => _walkServerEntries(c, entries));
  }
}

/**
 * HTML-escape a string for safe attribute and text content embedding.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Custom Element compilation (§20.8) ───────────────────────────────────────

/**
 * Compile a JSONsx custom element document to a JS module string.
 * The output is a self-registering ES module that:
 *   - imports @vue/reactivity (reactive, computed, effect)
 *   - imports lit-html (render, html)
 *   - imports side-effect registrations for $elements dependencies
 *   - defines class extends HTMLElement with reactive state
 *   - calls customElements.define()
 *
 * @param {string | object} sourcePath - Path to .json file or raw object
 * @param {object}          [opts]
 * @param {string}          [opts.basePath]   - Base directory for resolving $elements refs
 * @param {Function}        [opts.resolveElementPath] - Custom resolver for $elements paths
 *   Receives (refPath, basePath) and returns the output .js path to import.
 *   Default: replaces .json with .js and keeps relative structure.
 * @returns {Promise<{ files: Array<{ path: string, content: string, tagName: string }> }>}
 *   Array of files to write. First entry is always the root element.
 */
export async function compileElement(sourcePath, opts = {}) {
  const { resolveElementPath } = opts;
  const files = [];
  const visited = new Set();

  async function processElement(srcPath, parentDir) {
    let doc, filePath;
    if (typeof srcPath === "string") {
      const { readFileSync } = await import("node:fs");
      const { resolve, dirname, basename } = await import("node:path");
      filePath = parentDir ? resolve(parentDir, srcPath) : resolve(srcPath);
      if (visited.has(filePath)) return;
      visited.add(filePath);
      doc = JSON.parse(readFileSync(filePath, "utf8"));
    } else {
      doc = srcPath;
      filePath = null;
      if (visited.has(doc.tagName)) return;
      visited.add(doc.tagName);
    }

    const tagName = doc.tagName;
    if (!tagName || !tagName.includes("-")) {
      throw new Error(`compileElement: tagName "${tagName}" must contain a hyphen`);
    }

    const { dirname: dn, basename: bn } = await import("node:path");
    const currentDir = filePath ? dn(filePath) : null;

    // Process $elements dependencies depth-first
    const elementImports = [];
    if (Array.isArray(doc.$elements)) {
      for (const elRef of doc.$elements) {
        const refPath = elRef.$ref ?? elRef;
        if (typeof refPath !== "string") continue;

        if (currentDir) {
          await processElement(refPath, currentDir);
        }

        // Determine the import path for this dependency
        let importPath;
        if (resolveElementPath) {
          importPath = resolveElementPath(refPath, currentDir);
        } else {
          importPath = refPath.replace(/\.json$/, ".js");
        }
        elementImports.push(importPath);
      }
    }

    // Generate the JS module
    const className = tagNameToClassName(tagName);
    const jsContent = emitElementModule(doc, className, elementImports);

    const outputPath = filePath ? filePath.replace(/\.json$/, ".js") : `${tagName}.js`;

    files.push({ path: outputPath, content: jsContent, tagName });
  }

  await processElement(sourcePath, opts.basePath ?? null);
  return { files };
}

/**
 * Compile a JSONsx custom element document to a complete HTML page
 * with an import map for CDN dependencies.
 *
 * @param {string | object} sourcePath
 * @param {object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.reactivitySrc]
 * @param {string} [opts.litHtmlSrc]
 * @returns {Promise<{ html: string, files: Array<{ path: string, content: string, tagName: string }> }>}
 */
export async function compileElementPage(sourcePath, opts = {}) {
  const {
    title = "JSONsx App",
    reactivitySrc = "https://esm.sh/@vue/reactivity@3.5.13",
    litHtmlSrc = "https://esm.sh/lit-html@3.3.0",
  } = opts;

  const result = await compileElement(sourcePath, opts);

  // Root element is the last one processed (depth-first, root last)
  const root = result.files[result.files.length - 1];

  const { basename } = await import("node:path");
  const rootScript = basename(root.path);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <script type="importmap">
  {
    "imports": {
      "@vue/reactivity": "${reactivitySrc}",
      "lit-html": "${litHtmlSrc}"
    }
  }
  </script>
</head>
<body>
  <${root.tagName}></${root.tagName}>
  <script type="module" src="./${rootScript}"></script>
</body>
</html>`;

  return { html: htmlContent, files: result.files };
}

// ─── Element code generation helpers ──────────────────────────────────────────

/**
 * Convert a page title to a valid custom element tag name.
 * Custom element names must contain a hyphen and be lowercase.
 */
function titleToTagName(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Ensure it contains a hyphen (required for custom elements)
  return slug.includes("-") ? slug : `jsonsx-${slug}`;
}

function tagNameToClassName(tagName) {
  return tagName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/**
 * Generate a complete ES module string for a custom element.
 */
function emitElementModule(doc, className, elementImports) {
  const lines = [];

  lines.push("// Generated by @jsonsx/compiler — do not edit manually");
  if (doc.$id) lines.push(`// Source: ${doc.$id}`);

  // Side-effect imports for sub-elements
  for (const imp of elementImports) {
    lines.push(`import '${imp}';`);
  }

  lines.push(`import { reactive, computed, effect } from '@vue/reactivity';`);
  lines.push(`import { render, html } from 'lit-html';`);
  lines.push("");
  lines.push(`class ${className} extends HTMLElement {`);
  lines.push("  #dispose = null;");
  lines.push("");

  // Constructor: build reactive state
  lines.push("  constructor() {");
  lines.push("    super();");

  const defs = doc.$defs ?? {};
  const stateEntries = [];
  const computedEntries = [];
  const functionEntries = [];

  for (const [key, def] of Object.entries(defs)) {
    if (def && typeof def === "object" && !Array.isArray(def) && def.$prototype === "Function") {
      if (def.signal) {
        computedEntries.push([key, def]);
      } else {
        functionEntries.push([key, def]);
      }
    } else {
      stateEntries.push([key, def]);
    }
  }

  // Emit reactive({...}) with initial state values
  lines.push("    this.state = reactive({");
  for (const [key, def] of stateEntries) {
    lines.push(`      ${key}: ${JSON.stringify(def)},`);
  }
  lines.push("    });");

  // Emit functions: this.state.fnName = ($defs) => { body }
  for (const [key, def] of functionEntries) {
    lines.push("");
    const args = def.arguments ?? ["$defs"];
    // If body references $defs but first arg is named differently, keep as-is
    const paramList = args.join(", ");
    lines.push(`    this.state.${key} = (${paramList}) => {`);
    lines.push(`      ${def.body}`);
    lines.push("    };");
  }

  // Emit computed signals
  for (const [key, def] of computedEntries) {
    lines.push("");
    lines.push(`    this.state.${key} = computed(() => {`);
    // Replace $defs references with this.state references
    const body = def.body.replace(/\$defs\./g, "this.state.");
    lines.push(`      ${body}`);
    lines.push("    });");
  }

  lines.push("  }"); // end constructor
  lines.push("");

  // Template method
  lines.push("  template() {");
  lines.push("    const s = this.state;");
  lines.push("    return html`");
  lines.push(emitLitChildren(doc.children, doc.style, "      "));
  lines.push("    `;");
  lines.push("  }");
  lines.push("");

  // connectedCallback
  lines.push("  connectedCallback() {");
  lines.push("    for (const key of Object.keys(this.state)) {");
  lines.push("      if (key in this && this[key] !== undefined) {");
  lines.push("        this.state[key] = this[key];");
  lines.push("      }");
  lines.push("    }");
  // Apply host element styles (static and dynamic)
  if (doc.style && typeof doc.style === "object") {
    const staticStyles = [];
    const dynamicStyles = [];
    for (const [prop, value] of Object.entries(doc.style)) {
      if (
        prop.startsWith(":") || prop.startsWith(".") || prop.startsWith("&") ||
        prop.startsWith("[") || prop.startsWith("@")
      ) continue;
      if (value === null || typeof value === "object") continue;
      const cssProp = camelToKebab(prop);
      if (typeof value === "string" && value.includes("${")) {
        dynamicStyles.push([cssProp, value]);
      } else {
        staticStyles.push([cssProp, value]);
      }
    }
    if (staticStyles.length > 0) {
      for (const [cssProp, value] of staticStyles) {
        lines.push(`    this.style['${cssProp}'] = ${JSON.stringify(value)};`);
      }
    }
    if (dynamicStyles.length > 0) {
      lines.push("    effect(() => {");
      for (const [cssProp, value] of dynamicStyles) {
        const expr = value.replace(/\$\{([^}]+)\}/g, (_, e) =>
          "${" + e.replace(/\$defs\./g, "this.state.") + "}"
        );
        lines.push(`      this.style['${cssProp}'] = \`${expr}\`;`);
      }
      lines.push("    });");
    }
  }
  lines.push("    this.#dispose = effect(() => render(this.template(), this));");
  lines.push("  }");
  lines.push("");

  // disconnectedCallback
  lines.push("  disconnectedCallback() {");
  lines.push("    if (this.#dispose) { this.#dispose(); this.#dispose = null; }");
  lines.push("  }");

  lines.push("}");
  lines.push("");
  lines.push(`customElements.define('${doc.tagName}', ${className});`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Convert JSONsx children to lit-html template content.
 */
function emitLitChildren(children, parentStyle, indent) {
  if (!children) return "";

  // Mapped array: children.$prototype === 'Array'
  if (children.$prototype === "Array") {
    return emitMappedArray(children, indent);
  }

  if (!Array.isArray(children)) return "";

  return children.map((child) => emitLitNode(child, indent)).join("\n");
}

function emitLitNode(def, indent) {
  const tag = def.tagName ?? "div";
  const isCustom = tag.includes("-");

  // Collect attribute/property/event strings
  const parts = [];

  // Static attributes
  if (def.attributes) {
    for (const [key, val] of Object.entries(def.attributes)) {
      if (typeof val === "string" && val.includes("${")) {
        // Dynamic attribute — skip at compile time (use lit expression)
        parts.push(`${key}="${toLitExpr(val)}"`);
      } else {
        parts.push(`${key}="${val}"`);
      }
    }
  }

  if (def.id) parts.push(`id="${def.id}"`);
  if (def.className) parts.push(`class="${def.className}"`);

  // Properties via $ref or literal
  for (const [key, val] of Object.entries(def)) {
    if (
      RESERVED_KEYS.has(key) ||
      key.startsWith("$") ||
      key.startsWith("on") ||
      key === "tagName" ||
      key === "id" ||
      key === "className" ||
      key === "style" ||
      key === "children" ||
      key === "textContent" ||
      key === "innerHTML" ||
      key === "attributes"
    )
      continue;

    if (val && typeof val === "object" && val.$ref) {
      parts.push(`.${key}="\${${refToExpr(val.$ref)}}"`);
    } else if (typeof val === "string" && val.includes("${")) {
      parts.push(`.${key}="${toLitExpr(val)}"`);
    }
  }

  // $props for custom elements
  if (def.$props) {
    for (const [key, val] of Object.entries(def.$props)) {
      if (val && typeof val === "object" && val.$ref) {
        parts.push(`.${key}="\${${refToExpr(val.$ref)}}"`);
      } else {
        parts.push(`.${key}="\${${JSON.stringify(val)}}"`);
      }
    }
  }

  // Events
  for (const [key, val] of Object.entries(def)) {
    if (!key.startsWith("on") || key === "observedAttributes") continue;
    const eventName = key.slice(2).toLowerCase();
    if (val && typeof val === "object" && val.$ref) {
      // $ref to a function in $defs
      parts.push(`@${eventName}="\${(e) => ${refToExpr(val.$ref)}(s, e)}"`);
    } else if (val && typeof val === "object" && val.$prototype === "Function") {
      // Inline function
      parts.push(`@${eventName}="\${(e) => { ${inlineHandlerBody(val)} }}"`);
    }
  }

  // Style
  const styleStr = emitStyleString(def.style);
  if (styleStr) parts.push(`style="${styleStr}"`);

  const attrsStr = parts.length > 0 ? "\n" + indent + "  " + parts.join("\n" + indent + "  ") : "";

  // Self-closing tags
  const selfClosing = new Set(["input", "br", "hr", "img", "meta", "link"]);
  if (selfClosing.has(tag)) {
    return `${indent}<${tag}${attrsStr}\n${indent}>`;
  }

  // Inner content
  let inner = "";
  if (def.textContent !== undefined) {
    inner = toLitTextContent(def.textContent);
  } else if (def.innerHTML !== undefined) {
    inner = def.innerHTML;
  } else if (def.children) {
    inner = "\n" + emitLitChildren(def.children, def.style, indent + "  ") + "\n" + indent;
  }

  return `${indent}<${tag}${attrsStr}\n${indent}>${inner}</${tag}>`;
}

function emitMappedArray(arrayDef, indent) {
  const itemsExpr = arrayDef.items?.$ref ? refToExpr(arrayDef.items.$ref) : "ITEMS";
  const mapDef = arrayDef.map;

  if (!mapDef) return "";

  // Generate the map expression
  const tag = mapDef.tagName ?? "div";
  const isCustom = tag.includes("-");

  const parts = [];

  // $props
  if (mapDef.$props) {
    for (const [key, val] of Object.entries(mapDef.$props)) {
      if (val && typeof val === "object" && val.$ref) {
        parts.push(`.${key}="\${${mapRefToExpr(val.$ref)}}"`);
      } else {
        parts.push(`.${key}="\${${JSON.stringify(val)}}"`);
      }
    }
  }

  // Style
  const styleStr = emitStyleString(mapDef.style);
  if (styleStr) parts.push(`style="${styleStr}"`);

  // Events
  for (const [key, val] of Object.entries(mapDef)) {
    if (!key.startsWith("on")) continue;
    const eventName = key.slice(2).toLowerCase();
    if (val && typeof val === "object" && val.$ref) {
      parts.push(`@${eventName}="\${(e) => ${refToExpr(val.$ref)}(s, e)}"`);
    }
  }

  const attrsStr =
    parts.length > 0 ? "\n" + indent + "    " + parts.join("\n" + indent + "    ") : "";

  let inner = "";
  if (mapDef.textContent !== undefined) {
    inner = toLitTextContent(mapDef.textContent);
  } else if (mapDef.children) {
    inner =
      "\n" + emitLitChildren(mapDef.children, null, indent + "      ") + "\n" + indent + "    ";
  }

  return `${indent}\${${itemsExpr}.map((item, index) => html\`\n${indent}  <${tag}${attrsStr}\n${indent}  >${inner}</${tag}>\n${indent}\`)}`;
}

/**
 * Convert a $ref string to a JS expression using `s` (this.state alias).
 */
function refToExpr(ref) {
  if (ref.startsWith("#/$defs/")) {
    const path = ref.slice("#/$defs/".length);
    return "s." + path.replace(/\//g, ".");
  }
  if (ref.startsWith("$map/")) {
    const path = ref.slice("$map/".length);
    return path.replace(/\//g, ".");
  }
  return "s." + ref;
}

/**
 * Convert a $ref inside a mapped array context.
 * $map/item → item, $map/index → index, #/$defs/x → s.x
 */
function mapRefToExpr(ref) {
  if (ref.startsWith("$map/")) {
    return ref.slice("$map/".length).replace(/\//g, ".");
  }
  return refToExpr(ref);
}

/**
 * Convert a JSONsx template string "${$defs.xxx}" to a lit-html expression.
 * Replaces $defs. references with s. references.
 */
function toLitExpr(str) {
  return str.replace(/\$defs\./g, "s.");
}

function toLitTextContent(value) {
  if (typeof value === "string" && value.includes("${")) {
    return toLitExpr(value);
  }
  return String(value);
}

/**
 * Convert an inline $prototype: "Function" handler to a JS body string.
 * Replaces $defs references with s references.
 */
function inlineHandlerBody(def) {
  const body = def.body ?? "";
  // Map $defs to s, and event arg
  return body.replace(/\$defs\./g, "s.").replace(/\$defs/g, "s");
}

/**
 * Convert a JSONsx style object to an inline style string for lit-html.
 * Handles both static values and ${} template expressions.
 */
function emitStyleString(styleDef) {
  if (!styleDef || typeof styleDef !== "object") return "";

  const parts = [];
  for (const [prop, value] of Object.entries(styleDef)) {
    // Skip nested selectors (:hover, .class, &, @media)
    if (
      prop.startsWith(":") ||
      prop.startsWith(".") ||
      prop.startsWith("&") ||
      prop.startsWith("[") ||
      prop.startsWith("@")
    )
      continue;

    if (value === null || typeof value === "object") continue;

    const cssProp = camelToKebab(prop);
    if (typeof value === "string" && value.includes("${")) {
      parts.push(`${cssProp}: ${toLitExpr(value)}`);
    } else {
      parts.push(`${cssProp}: ${value}`);
    }
  }

  return parts.join("; ");
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[2]) {
  const [, , src, out] = process.argv;

  Promise.all([compile(src), compileServer(src)])
    .then(async ([result, server]) => {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname, join } = await import("node:path");
      if (out) {
        writeFileSync(out, result.html, "utf8");
        console.error(`Written to ${out}`);
        const outDir = dirname(out);
        for (const f of result.files) {
          const filePath = join(outDir, f.path);
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, f.content, "utf8");
          console.error(`Written to ${filePath}`);
        }
      } else {
        process.stdout.write(result.html);
      }
      if (server && out) {
        const serverOut = out.replace(/(\.[^.]+)?$/, "-server.js");
        writeFileSync(serverOut, server, "utf8");
        console.error(`Server handler written to ${serverOut}`);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
