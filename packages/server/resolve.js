/**
 * resolve.js — Generic $src module proxy + timing: "server" function proxy
 */

import { resolve, relative, dirname } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Handle POST /__jsonsx_resolve__ — proxy $prototype + $src entries.
 */
export async function handleResolve(req, root) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { $src, $prototype, $export: xport, $base, ...config } = body;
  if (!$src) return new Response("Missing $src", { status: 400 });

  let moduleAbsPath;
  try {
    if ($base) {
      const docUrlPath = new URL($base).pathname;
      const docDir = docUrlPath.slice(0, docUrlPath.lastIndexOf("/") + 1);
      moduleAbsPath = resolve(resolve(root, "." + docDir), $src);
    } else {
      moduleAbsPath = resolve(root, $src);
    }
  } catch (e) {
    return new Response(`Cannot resolve $src "${$src}": ${e.message}`, { status: 400 });
  }

  // Rebase relative config paths from doc-relative to CWD-relative
  if ($base) {
    const docUrlPath = new URL($base).pathname;
    const docDir = docUrlPath.slice(0, docUrlPath.lastIndexOf("/") + 1);
    const docAbsDir = resolve(root, "." + docDir);
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === "string" && (v.startsWith("./") || v.startsWith("../"))) {
        config[k] = "./" + relative(process.cwd(), resolve(docAbsDir, v));
      }
    }
  }

  // .class.json: read schema, follow $implementation to the real JS module
  if (moduleAbsPath.endsWith(".class.json")) {
    try {
      const content = readFileSync(moduleAbsPath, "utf8");
      const classDef = JSON.parse(content);

      if (classDef.$implementation) {
        // Hybrid mode: redirect to the JS implementation
        const implPath = resolve(dirname(moduleAbsPath), classDef.$implementation);
        const exportName = xport ?? classDef.title ?? $prototype;
        const mod = await import(implPath);
        const ExportedClass = mod[exportName] ?? mod.default?.[exportName];
        if (typeof ExportedClass !== "function") {
          return new Response(`Export "${exportName}" not found in "${classDef.$implementation}"`, { status: 500 });
        }
        const instance = new ExportedClass(config);
        const value =
          typeof instance.resolve === "function"
            ? await instance.resolve()
            : "value" in instance
              ? instance.value
              : instance;
        return Response.json(value);
      }

      // Self-contained: construct class from schema
      const DynClass = classFromSchema(classDef);
      const instance = new DynClass(config);
      const value =
        typeof instance.resolve === "function"
          ? await instance.resolve()
          : "value" in instance
            ? instance.value
            : instance;
      return Response.json(value);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  let mod;
  try {
    mod = await import(moduleAbsPath);
  } catch (e) {
    return new Response(`Failed to import "${$src}": ${e.message}`, { status: 500 });
  }

  const exportName = xport ?? $prototype;
  const ExportedClass = mod[exportName] ?? mod.default?.[exportName];
  if (typeof ExportedClass !== "function") {
    return new Response(`Export "${exportName}" not found in "${$src}"`, { status: 500 });
  }

  try {
    const instance = new ExportedClass(config);
    const value =
      typeof instance.resolve === "function"
        ? await instance.resolve()
        : "value" in instance
          ? instance.value
          : instance;
    return Response.json(value);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Handle POST /__jsonsx_server__ — proxy timing: "server" function calls.
 * In dev mode, the runtime sends these instead of hitting the production Hono handler.
 */
export async function handleServerFunction(req, root) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { $src, $export: xport, $base, arguments: args = {} } = body;
  if (!$src || !xport) return new Response("Missing $src or $export", { status: 400 });

  let moduleAbsPath;
  try {
    if ($base) {
      const docUrlPath = new URL($base).pathname;
      const docDir = docUrlPath.slice(0, docUrlPath.lastIndexOf("/") + 1);
      moduleAbsPath = resolve(resolve(root, "." + docDir), $src);
    } else {
      moduleAbsPath = resolve(root, $src);
    }
  } catch (e) {
    return new Response(`Cannot resolve $src: ${e.message}`, { status: 400 });
  }

  let mod;
  try {
    mod = await import(moduleAbsPath);
  } catch (e) {
    return new Response(`Failed to import "${$src}": ${e.message}`, { status: 500 });
  }

  const fn = mod[xport] ?? mod.default?.[xport];
  if (typeof fn !== "function") {
    return new Response(`Export "${xport}" not found in "${$src}"`, { status: 500 });
  }

  try {
    const result = await fn(args);
    return Response.json(result ?? null);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Dynamically construct a class from a .class.json schema definition.
 * Server-side variant — no private field limitations.
 */
function classFromSchema(classDef) {
  const fields = classDef.$defs?.fields ?? {};
  const ctor = classDef.$defs?.constructor;
  const methods = classDef.$defs?.methods ?? {};

  class DynClass {
    constructor(config = {}) {
      for (const [key, field] of Object.entries(fields)) {
        const id = field.identifier ?? key;
        if (config[id] !== undefined) this[id] = config[id];
        else if (field.initializer !== undefined) this[id] = field.initializer;
        else if (field.default !== undefined) this[id] = structuredClone(field.default);
        else this[id] = null;
      }
      if (ctor?.body) {
        const bodyStr = Array.isArray(ctor.body) ? ctor.body.join("\n") : ctor.body;
        new Function("config", bodyStr).call(this, config);
      }
    }
  }

  for (const [key, method] of Object.entries(methods)) {
    const name = method.identifier ?? key;
    const params = (method.parameters ?? []).map((p) => {
      if (p.$ref) return p.$ref.split("/").pop();
      return p.identifier ?? p.name ?? "arg";
    });
    const bodyStr = Array.isArray(method.body) ? method.body.join("\n") : (method.body ?? "");

    if (method.role === "accessor") {
      const descriptor = {};
      if (method.getter) descriptor.get = new Function(method.getter.body);
      if (method.setter) {
        const sp = (method.setter.parameters ?? []).map((p) => p.$ref?.split("/").pop() ?? "v");
        descriptor.set = new Function(...sp, method.setter.body);
      }
      Object.defineProperty(DynClass.prototype, name, { ...descriptor, configurable: true });
    } else if (method.scope === "static") {
      DynClass[name] = new Function(...params, bodyStr);
    } else {
      DynClass.prototype[name] = new Function(...params, bodyStr);
    }
  }

  Object.defineProperty(DynClass, "name", { value: classDef.title, configurable: true });
  return DynClass;
}
