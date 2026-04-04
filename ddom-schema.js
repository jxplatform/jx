/**
 * ddom-schema.js — DDOM JSON Schema 2020-12 meta-schema generator
 * @version 0.8.0
 * @license MIT
 *
 * Generates a comprehensive JSON Schema 2020-12 document that validates DDOM
 * source files (.json component files). The generated schema can be used with
 * any JSON Schema 2020-12 compatible validator (Ajv, jsonschema, VSCode, etc.).
 *
 * Usage:
 *   import { generateSchema } from './ddom-schema.js';
 *   const schema = generateSchema();
 *   // Write to disk for $schema validation:
 *   fs.writeFileSync('ddom-schema.json', JSON.stringify(schema, null, 2));
 *
 * CLI:
 *   node ddom-schema.js [output-path]
 *   node ddom-schema.js > ddom-schema.json
 *
 * The generated schema is the normative source for:
 *   - IDE autocomplete and inline validation (via $schema pointer in documents)
 *   - Builder tooling (which fields are valid, which are required)
 *   - Compile-time validation (pre-build document linting)
 *   - Documentation (schema $description fields)
 *
 * @module ddom-schema
 */

// ─── Shared definitions ───────────────────────────────────────────────────────

/**
 * All supported $prototype values.
 * @type {string[]}
 */
const PROTOTYPES = [
  'Request', 'URLSearchParams', 'FormData',
  'LocalStorage', 'SessionStorage', 'Cookie',
  'IndexedDB', 'Array', 'Set', 'Map',
  'Blob', 'ReadableStream',
];

/**
 * Standard DOM event handler property names.
 * @type {string[]}
 */
const EVENT_HANDLERS = [
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
  'onmouseout', 'onmousemove', 'onkeydown', 'onkeyup', 'onkeypress',
  'oninput', 'onchange', 'onsubmit', 'onreset', 'onfocus', 'onblur',
  'onscroll', 'onresize', 'onload', 'onunload', 'onerror',
  'oncontextmenu', 'onwheel', 'ondrag', 'ondragstart', 'ondragend',
  'ondragover', 'ondrop', 'ontouchstart', 'ontouchmove', 'ontouchend',
  'onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel',
];

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate the full DDOM meta-schema as a plain JavaScript object.
 *
 * The schema structure follows JSON Schema 2020-12 conventions and uses
 * `$defs` for reusable sub-schemas. DDOM's own `$defs` keyword is handled
 * as an object property (not a JSON Schema definition mechanism here).
 *
 * @returns {object} JSON Schema 2020-12 document
 */
export function generateSchema() {
  return {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    '$id': 'https://declarative-dom.org/schema/v1',
    'title': 'DDOM Document',
    'description':
      'Schema for Declarative Document Object Model (DDOM) component files. ' +
      'A DDOM document is a JSON object that declaratively describes a reactive ' +
      'web component: its structure (DOM tree), styling, reactive state ($defs), ' +
      'and a reference to its companion JavaScript handler file.',
    'type': 'object',
    'required': ['tagName'],

    // ── Top-level properties ────────────────────────────────────────────────
    'properties': {
      '$schema': {
        'description': 'URI identifying the DDOM dialect version. Enables schema-aware IDE tooling.',
        'type': 'string',
        'examples': ['https://declarative-dom.org/schema/v1'],
      },
      '$id': {
        'description': 'Component identifier string. Used by tooling and the builder.',
        'type': 'string',
        'examples': ['Counter', 'TodoApp', 'UserCard'],
      },
      '$handlers': {
        'description':
          'Relative path or URL to the companion .js ES module file that exports event ' +
          'handlers. Follows ES module specifier rules — IDE CTRL-click navigation works natively.',
        'type': 'string',
        'examples': ['./counter.js', './components/my-widget.js'],
      },
      '$defs': {
        'description':
          'Signal and handler declarations for this component. ' +
          '$-prefixed keys are signals; plain keys are handler declarations.',
        '$ref': '#/$defs/DefsMap',
      },
      'tagName': { '$ref': '#/$defs/TagName' },
      'children': { '$ref': '#/$defs/ChildrenValue' },
      'style':      { '$ref': '#/$defs/StyleObject' },
      'attributes': { '$ref': '#/$defs/AttributesObject' },
    },

    // Forward-declare all non-required top-level DOM properties
    'additionalProperties': { '$ref': '#/$defs/ElementPropertyValue' },

    // ── Reusable sub-schemas ────────────────────────────────────────────────
    '$defs': {

      // ── $defs map ────────────────────────────────────────────────────────
      'DefsMap': {
        'description': 'Map of signal declarations, computed signals, handler declarations, and prototype namespaces.',
        'type': 'object',
        'additionalProperties': { '$ref': '#/$defs/DefEntry' },
        'propertyNames': {
          'description': 'Signal names conventionally use the $ prefix; handler names do not.',
          'type': 'string',
        },
      },

      'DefEntry': {
        'description': 'A single $defs entry: a signal, computed signal, handler declaration, or prototype namespace.',
        'oneOf': [
          { '$ref': '#/$defs/StateSignalDef' },
          { '$ref': '#/$defs/ComputedSignalDef' },
          { '$ref': '#/$defs/HandlerDef' },
          { '$ref': '#/$defs/PrototypeDef' },
        ],
      },

      'StateSignalDef': {
        'description': 'A reactive state signal. Wraps the default value in a Signal.State at runtime.',
        'type': 'object',
        'required': ['signal'],
        'properties': {
          'signal':      { 'type': 'boolean', 'const': true },
          'type':        { '$ref': '#/$defs/JsonSchemaType' },
          'default':     { 'description': 'Initial value for the signal.', },
          'description': { 'type': 'string' },
        },
        'additionalProperties': false,
        'examples': [
          { 'type': 'integer', 'default': 0, 'signal': true },
          { 'type': 'string', 'default': 'World', 'signal': true },
          { 'type': 'boolean', 'default': false, 'signal': true },
          { 'type': 'array', 'default': [], 'signal': true },
        ],
      },

      'ComputedSignalDef': {
        'description':
          'A read-only computed signal. Evaluated as a JSONata expression. ' +
          'Re-evaluates whenever any declared $dep changes.',
        'type': 'object',
        'required': ['$compute', 'signal'],
        'properties': {
          '$compute': {
            'description': 'JSONata expression string. Has access to dep signal values by their key name (without #/$defs/ prefix).',
            'type': 'string',
            'examples': [
              '$count * 2',
              '$count > 10 ? \'high\' : \'low\'',
              '$firstName & \' \' & $lastName',
              'count($items[done = false])',
            ],
          },
          '$deps': {
            'description': 'Explicit dependency list. Each entry is a $ref string pointing to a $defs signal.',
            'type': 'array',
            'items': { '$ref': '#/$defs/InternalRef' },
            'examples': [['#/$defs/$count'], ['#/$defs/$firstName', '#/$defs/$lastName']],
          },
          'signal':      { 'type': 'boolean', 'const': true },
          'type':        { '$ref': '#/$defs/JsonSchemaType' },
          'description': { 'type': 'string' },
        },
        'additionalProperties': false,
      },

      'HandlerDef': {
        'description':
          'Declares that a function with this key must be exported from the $handlers module. ' +
          'The compiler validates that the export exists.',
        'type': 'object',
        'required': ['$handler'],
        'properties': {
          '$handler':    { 'type': 'boolean', 'const': true },
          'description': { 'type': 'string' },
        },
        'additionalProperties': false,
        'examples': [
          { '$handler': true },
          { '$handler': true, 'description': 'Fires when element connects to the DOM' },
        ],
      },

      'PrototypeDef': {
        'description': 'A Web API namespace signal. The $prototype key identifies which Web API to wrap.',
        'type': 'object',
        'required': ['$prototype'],
        'properties': {
          '$prototype': {
            'description': 'Web API constructor name identifying the namespace handler.',
            'type': 'string',
            'enum': PROTOTYPES,
          },
          'signal': { 'type': 'boolean' },
          'timing': {
            'description':
              'Execution timing for Request prototypes. ' +
              '"server" bakes the response at build time; "client" (default) fetches at runtime.',
            'type': 'string',
            'enum': ['server', 'client'],
          },
          'manual': {
            'description': 'If true, the Request will not auto-fetch. Call .fetch() manually.',
            'type': 'boolean',
          },
          'debounce': {
            'description': 'Debounce interval in milliseconds for auto-fetching Request prototypes.',
            'type': 'integer',
            'minimum': 0,
          },
          'url':    { 'description': 'Request URL (string or $ref).', '$ref': '#/$defs/StringOrRef' },
          'method': { 'type': 'string', 'enum': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
          'headers': { 'type': 'object', 'additionalProperties': { 'type': 'string' } },
          'body':    { 'description': 'Request body. Objects are JSON-serialized automatically.' },
          'responseType': { 'type': 'string', 'enum': ['json', 'text', 'blob', 'arraybuffer', 'document', ''] },
          'key':     { 'description': 'Storage key for LocalStorage/SessionStorage/Cookie prototypes.', 'type': 'string' },
          'name':    { 'description': 'Cookie name.', 'type': 'string' },
          'maxAge':  { 'type': 'integer' },
          'expires': { 'type': 'string' },
          'path':    { 'type': 'string' },
          'domain':  { 'type': 'string' },
          'secure':  { 'type': 'boolean' },
          'sameSite': { 'type': 'string', 'enum': ['strict', 'lax', 'none'] },
          'database':       { 'type': 'string', 'description': 'IndexedDB database name.' },
          'store':          { 'type': 'string', 'description': 'IndexedDB object store name.' },
          'version':        { 'type': 'integer', 'minimum': 1 },
          'keyPath':        { 'type': 'string' },
          'autoIncrement':  { 'type': 'boolean' },
          'indexes': {
            'type': 'array',
            'items': {
              'type': 'object',
              'required': ['name', 'keyPath'],
              'properties': {
                'name':    { 'type': 'string' },
                'keyPath': { 'oneOf': [{ 'type': 'string' }, { 'type': 'array', 'items': { 'type': 'string' } }] },
                'unique':  { 'type': 'boolean' },
              },
            },
          },
          'default':     {},
          'description': { 'type': 'string' },
          'items':       {},
          'map':         { '$ref': '#/$defs/ElementDef' },
          'filter':      { '$ref': '#/$defs/RefObject' },
          'sort':        { '$ref': '#/$defs/RefObject' },
        },
      },

      // ── Element definition ────────────────────────────────────────────────
      'ElementDef': {
        'description': 'A DDOM element definition. Maps directly to a DOM element.',
        'type': 'object',
        'required': ['tagName'],
        'properties': {
          'tagName':     { '$ref': '#/$defs/TagName' },
          'id':          { 'type': 'string', 'description': 'Element id. Protected — not bindable via $ref.' },
          'className':   { '$ref': '#/$defs/StringOrRef' },
          'textContent': { '$ref': '#/$defs/StringOrRef' },
          'innerHTML':   { '$ref': '#/$defs/StringOrRef' },
          'innerText':   { '$ref': '#/$defs/StringOrRef' },
          'hidden':      { '$ref': '#/$defs/BoolOrRef' },
          'tabIndex':    { '$ref': '#/$defs/NumberOrRef' },
          'title':       { '$ref': '#/$defs/StringOrRef' },
          'lang':        { '$ref': '#/$defs/StringOrRef' },
          'dir':         { 'type': 'string', 'enum': ['ltr', 'rtl', 'auto'] },
          'value':       { '$ref': '#/$defs/StringOrRef' },
          'checked':     { '$ref': '#/$defs/BoolOrRef' },
          'disabled':    { '$ref': '#/$defs/BoolOrRef' },
          'selected':    { '$ref': '#/$defs/BoolOrRef' },
          'src':         { '$ref': '#/$defs/StringOrRef' },
          'href':        { '$ref': '#/$defs/StringOrRef' },
          'alt':         { '$ref': '#/$defs/StringOrRef' },
          'type':        { '$ref': '#/$defs/StringOrRef' },
          'name':        { '$ref': '#/$defs/StringOrRef' },
          'placeholder': { '$ref': '#/$defs/StringOrRef' },
          'children':    { '$ref': '#/$defs/ChildrenValue' },
          'style':       { '$ref': '#/$defs/StyleObject' },
          'attributes':  { '$ref': '#/$defs/AttributesObject' },
          '$switch':     { '$ref': '#/$defs/SwitchDef' },
          '$ref':        { '$ref': '#/$defs/ExternalRef' },
          '$props':      { '$ref': '#/$defs/PropsObject' },
          // Map context signals (only valid inside Array map definitions)
          '$map/item':   { '$ref': '#/$defs/RefObject', 'description': 'Bind to current Array map item.' },
          '$map/index':  { '$ref': '#/$defs/RefObject', 'description': 'Bind to current Array map index.' },
        },
        // Event handlers
        ...buildEventHandlerProperties(),
        'additionalProperties': { '$ref': '#/$defs/ElementPropertyValue' },
      },

      // ── Children value ────────────────────────────────────────────────────
      'ChildrenValue': {
        'description':
          'Children of an element. Either a static array of element definitions, ' +
          'or an Array namespace configuration for dynamic mapped lists.',
        'oneOf': [
          {
            'type': 'array',
            'items': { '$ref': '#/$defs/ElementDef' },
            'description': 'Static array of child element definitions.',
          },
          { '$ref': '#/$defs/ArrayNamespace' },
        ],
      },

      'ArrayNamespace': {
        'description':
          'Dynamic mapped list. Renders one child per item from the source array. ' +
          'Re-renders when the items signal changes.',
        'type': 'object',
        'required': ['$prototype', 'items', 'map'],
        'properties': {
          '$prototype': { 'type': 'string', 'const': 'Array' },
          'items': {
            'description': 'Data source. A $ref to a signal or a static array.',
            'oneOf': [
              { '$ref': '#/$defs/RefObject' },
              { 'type': 'array' },
            ],
          },
          'map': {
            'description': 'Element template rendered for each item. May reference $map/item and $map/index.',
            '$ref': '#/$defs/ElementDef',
          },
          'filter': {
            'description': '$ref to a handler function used to filter items.',
            '$ref': '#/$defs/RefObject',
          },
          'sort': {
            'description': '$ref to a handler function used to sort items.',
            '$ref': '#/$defs/RefObject',
          },
        },
        'additionalProperties': false,
      },

      // ── $switch ───────────────────────────────────────────────────────────
      'SwitchDef': {
        'description':
          'Dynamic component switching. The cases object maps signal values to element definitions. ' +
          'The rendered case is replaced whenever the signal changes.',
        'type': 'object',
        'required': ['$ref'],
        'properties': {
          '$ref': { '$ref': '#/$defs/InternalRef' },
        },
        'additionalProperties': false,
      },

      'SwitchNode': {
        'description': 'An element that renders one of several case components based on a signal value.',
        'type': 'object',
        'required': ['$switch', 'cases'],
        'properties': {
          'tagName': { '$ref': '#/$defs/TagName' },
          '$switch': { '$ref': '#/$defs/SwitchDef' },
          'cases': {
            'description': 'Map of signal value strings to element definitions or external $ref components.',
            'type': 'object',
            'additionalProperties': {
              'oneOf': [
                { '$ref': '#/$defs/ElementDef' },
                { '$ref': '#/$defs/ExternalComponentRef' },
              ],
            },
          },
        },
      },

      // ── Style ─────────────────────────────────────────────────────────────
      'StyleObject': {
        'description':
          'CSS style definition. camelCase property names follow CSSOM convention. ' +
          'Keys starting with :, ., &, or [ are treated as nested CSS selectors.',
        'type': 'object',
        'additionalProperties': {
          'oneOf': [
            { 'type': 'string' },
            { 'type': 'number' },
            {
              'type': 'object',
              'description': 'Nested CSS selector rules.',
              'additionalProperties': { 'oneOf': [{ 'type': 'string' }, { 'type': 'number' }] },
            },
          ],
        },
        'examples': [
          {
            'fontFamily': 'system-ui',
            'maxWidth': '480px',
            ':hover': { 'backgroundColor': 'blue' },
            '&.active': { 'outline': '2px solid white' },
          },
        ],
      },

      'AttributesObject': {
        'description': 'Non-standard HTML attributes and ARIA attributes. Rendered as element.setAttribute(k,v).',
        'type': 'object',
        'additionalProperties': {
          'oneOf': [
            { 'type': 'string' },
            { 'type': 'number' },
            { 'type': 'boolean' },
            { '$ref': '#/$defs/RefObject' },
          ],
        },
        'examples': [
          { 'data-component': 'my-widget', 'aria-label': 'Interactive counter' },
        ],
      },

      'PropsObject': {
        'description':
          'Explicit prop passing at a component boundary. Keys must correspond to ' +
          '$defs entries in the referenced component. ' +
          'Values may be static literals or $ref bindings.',
        'type': 'object',
        'additionalProperties': {
          'oneOf': [
            { 'type': 'string' },
            { 'type': 'number' },
            { 'type': 'boolean' },
            { 'type': 'array' },
            { 'type': 'object' },
            { '$ref': '#/$defs/RefObject' },
          ],
        },
      },

      // ── $ref types ────────────────────────────────────────────────────────
      'RefObject': {
        'description': 'A $ref binding. Resolves to a signal (reactive) or plain value (static).',
        'type': 'object',
        'required': ['$ref'],
        'properties': {
          '$ref': { '$ref': '#/$defs/AnyRef' },
        },
        'additionalProperties': false,
      },

      'AnyRef': {
        'description': 'A $ref URI string. May be internal, external file, or global namespace.',
        'type': 'string',
        'oneOf': [
          { '$ref': '#/$defs/InternalRef' },
          { '$ref': '#/$defs/ExternalRef' },
          { '$ref': '#/$defs/GlobalRef' },
          { '$ref': '#/$defs/MapRef' },
        ],
      },

      'InternalRef': {
        'description': 'Reference to a signal or handler in the current component\'s $defs.',
        'type': 'string',
        'pattern': '^#/\\$defs/',
        'examples': ['#/$defs/$count', '#/$defs/increment', '#/$defs/$items'],
      },

      'ExternalRef': {
        'description': 'Reference to an external DDOM component file.',
        'type': 'string',
        'pattern': '^(\\./|\\.\\./).*\\.json$|^https?://',
        'examples': ['./components/card.json', 'https://cdn.example.com/components/button.json'],
      },

      'ExternalComponentRef': {
        'description': 'Object form of an external component reference, with optional $props.',
        'type': 'object',
        'required': ['$ref'],
        'properties': {
          '$ref': { '$ref': '#/$defs/ExternalRef' },
          '$props': { '$ref': '#/$defs/PropsObject' },
        },
      },

      'GlobalRef': {
        'description': 'Reference to a window or document global property.',
        'type': 'string',
        'pattern': '^(window|document)#/',
        'examples': ['window#/currentUser', 'document#/appConfig'],
      },

      'MapRef': {
        'description': 'Reference to the current Array map iteration context.',
        'type': 'string',
        'enum': ['$map/item', '$map/index'],
      },

      // ── Property value types ──────────────────────────────────────────────
      'ElementPropertyValue': {
        'description': 'Any valid value for a DOM element property.',
        'oneOf': [
          { 'type': 'string' },
          { 'type': 'number' },
          { 'type': 'boolean' },
          { 'type': 'null' },
          { '$ref': '#/$defs/RefObject' },
        ],
      },

      'StringOrRef': {
        'oneOf': [
          { 'type': 'string' },
          { '$ref': '#/$defs/RefObject' },
        ],
      },

      'BoolOrRef': {
        'oneOf': [
          { 'type': 'boolean' },
          { '$ref': '#/$defs/RefObject' },
        ],
      },

      'NumberOrRef': {
        'oneOf': [
          { 'type': 'number' },
          { '$ref': '#/$defs/RefObject' },
        ],
      },

      // ── Primitives ────────────────────────────────────────────────────────
      'TagName': {
        'description':
          'HTML tag name. Custom elements (containing a hyphen) are registered ' +
          'as autonomous custom elements per the Web Components specification.',
        'type': 'string',
        'minLength': 1,
        'examples': ['div', 'span', 'button', 'my-counter', 'todo-app', 'user-card'],
      },

      'JsonSchemaType': {
        'description': 'JSON Schema primitive type vocabulary.',
        'type': 'string',
        'enum': ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'],
      },
    },
  };
}

/**
 * Build the event handler properties object for inclusion in ElementDef.
 * Each event handler property accepts a `$ref` to a declared handler function.
 *
 * @returns {object} JSON Schema `properties` fragment
 */
function buildEventHandlerProperties() {
  const properties = {};
  for (const name of EVENT_HANDLERS) {
    properties[name] = {
      'description': `Event handler for the "${name.slice(2)}" event. Must be a $ref to a declared handler.`,
      '$ref': '#/$defs/RefObject',
    };
  }
  return { properties };
}

/**
 * Return the meta-schema as a formatted JSON string.
 *
 * @returns {string}
 */
export function generateSchemaString() {
  return JSON.stringify(generateSchema(), null, 2);
}

/**
 * Validate a DDOM document against the generated schema using Ajv.
 * Returns a result object with `valid` boolean and `errors` array.
 *
 * Requires `ajv` and `ajv-formats` to be installed:
 *   npm install ajv ajv-formats
 *
 * @param {object} doc - DDOM document object to validate
 * @returns {Promise<{ valid: boolean, errors: object[] | null }>}
 *
 * @example
 * const result = await validateDocument(JSON.parse(fs.readFileSync('counter.json', 'utf8')));
 * if (!result.valid) console.error(result.errors);
 */
export async function validateDocument(doc) {
  let Ajv, addFormats;
  try {
    ({ default: Ajv }     = await import('ajv'));
    ({ default: addFormats } = await import('ajv-formats'));
  } catch {
    throw new Error(
      'DDOM schema validation requires ajv and ajv-formats: npm install ajv ajv-formats'
    );
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const schema   = generateSchema();
  const validate = ajv.compile(schema);
  const valid    = validate(doc);

  return { valid, errors: validate.errors ?? null };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('ddom-schema.js')) {
  const [,, out] = process.argv;
  const schemaStr = generateSchemaString();

  if (out) {
    const { writeFileSync } = await import('fs');
    writeFileSync(out, schemaStr, 'utf8');
    console.error(`DDOM meta-schema written to ${out}`);
  } else {
    process.stdout.write(schemaStr + '\n');
  }
}
