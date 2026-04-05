/**
 * studio.js — JSONsx Studio main application
 *
 * Phase 1: Open a JSONsx file, render in canvas, edit properties
 * in the inspector, see changes live, and save.
 * Phase 2: Tree editing with drag-and-drop reordering.
 */

import {
  createState, selectNode, hoverNode, undo, redo,
  insertNode, removeNode, duplicateNode, moveNode, updateProperty,
  updateStyle, updateAttribute, addDef, removeDef,
  getNodeAtPath, flattenTree, nodeLabel, pathKey,
  pathsEqual, parentElementPath, childIndex, isAncestor,
} from './state.js';

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  attachInstruction,
  extractInstruction,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';

// ─── Globals ──────────────────────────────────────────────────────────────────

let S; // current state
let statusMsg = '';
let statusTimeout;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const canvas     = $('#canvas');
const overlay    = $('#overlay');
const overlayClk = $('#overlay-click');
const leftPanel  = $('#left-panel');
const rightPanel = $('#right-panel');
const toolbar    = $('#toolbar');
const statusbar  = $('#statusbar');

/** WeakMap<HTMLElement, Array> — maps rendered DOM elements to their JSON paths */
const elToPath = new WeakMap();

/** DnD cleanup functions from previous render — called on re-render */
let dndCleanups = [];
/** Canvas DnD cleanup functions — separate from layer panel */
let canvasDndCleanups = [];

/** Cleanup function for the current selection drag registration */
let selDragCleanup = null;

/** Canvas drop indicator element */
const canvasDropLine = document.createElement('div');
canvasDropLine.className = 'canvas-drop-indicator';
canvasDropLine.style.display = 'none';

/** Void elements that cannot accept children */
const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr',
]);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const EMPTY_DOC = {
  tagName: 'div',
  style: { padding: '2rem', fontFamily: 'system-ui, sans-serif' },
  children: [
    { tagName: 'h1', textContent: 'New Component' },
    { tagName: 'p', textContent: 'Open a JSONsx file or start editing.' },
  ],
};

S = createState(structuredClone(EMPTY_DOC));
render();

// ─── Render loop ──────────────────────────────────────────────────────────────

function render() {
  renderToolbar();
  renderLeftPanel();
  renderCanvas();
  renderRightPanel();
  renderOverlays();
  renderStatusbar();
}

function update(newState) {
  const prevDoc = S.document;
  const prevSel = S.selection;
  S = newState;

  renderToolbar();

  if (prevDoc !== S.document) {
    renderCanvas();
    renderLeftPanel();
  } else if (!pathsEqual(prevSel, S.selection)) {
    renderLeftPanel();
  }

  renderRightPanel();
  renderOverlays();
  renderStatusbar();
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function renderCanvas() {
  // Clean up previous canvas DnD registrations
  for (const fn of canvasDndCleanups) fn();
  canvasDndCleanups = [];

  canvas.innerHTML = '';
  canvas.style.transform = `scale(${S.ui.zoom})`;
  renderCanvasNode(S.document, [], canvas);
  registerCanvasDnD();
}

/**
 * Recursively render a JSONsx node to the canvas DOM.
 * Simplified renderer for the builder — no signals, no handlers.
 * Just static DOM from the JSON tree.
 */
function renderCanvasNode(node, path, parent) {
  if (!node || typeof node !== 'object') return;

  const tag = node.tagName || 'div';
  const el = document.createElement(tag);

  // Map element → path for click-to-select
  elToPath.set(el, path);

  // Apply textContent
  if (typeof node.textContent === 'string') {
    el.textContent = node.textContent;
  } else if (typeof node.textContent === 'object' && node.textContent?.$ref) {
    el.textContent = `{${node.textContent.$ref}}`;
    el.style.opacity = '0.6';
    el.style.fontStyle = 'italic';
  }

  // Apply id / className
  if (node.id) el.id = node.id;
  if (node.className) el.className = node.className;

  // Apply style
  if (node.style && typeof node.style === 'object') {
    for (const [prop, val] of Object.entries(node.style)) {
      if (typeof val === 'string' || typeof val === 'number') {
        try { el.style[prop] = val; } catch {}
      }
    }
  }

  // Apply attributes
  if (node.attributes && typeof node.attributes === 'object') {
    for (const [attr, val] of Object.entries(node.attributes)) {
      try { el.setAttribute(attr, val); } catch {}
    }
  }

  // Recursively render children
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      renderCanvasNode(node.children[i], [...path, 'children', i], el);
    }
  }

  // Prevent canvas children from receiving pointer events (re-enabled during drag)
  el.style.pointerEvents = 'none';

  parent.appendChild(el);
  return el;
}

/** Track the last drag pointer position for canvas drop calculations */
let lastDragInput = null;

/**
 * Register all canvas elements as DnD drop targets.
 * Pointer events are toggled on only during active drags.
 */
function registerCanvasDnD() {
  const allEls = canvas.querySelectorAll('*');

  // Global monitor: enable pointer-events on canvas during drag, disable after
  const monitorCleanup = monitorForElements({
    onDragStart() {
      for (const el of canvas.querySelectorAll('*')) {
        el.style.pointerEvents = 'auto';
      }
      overlayClk.style.pointerEvents = 'none';
    },
    onDrag({ location }) {
      // Track pointer position for all canvas drop targets
      lastDragInput = location.current.input;
    },
    onDrop() {
      canvasDropLine.style.display = 'none';
      lastDragInput = null;
      for (const el of canvas.querySelectorAll('*')) {
        el.style.pointerEvents = 'none';
      }
      overlayClk.style.pointerEvents = '';
    },
  });
  canvasDndCleanups.push(monitorCleanup);

  for (const el of allEls) {
    const elPath = elToPath.get(el);
    if (!elPath) continue;

    const node = getNodeAtPath(S.document, elPath);
    const isVoid = VOID_ELEMENTS.has((node?.tagName || 'div').toLowerCase());

    const cleanup = dropTargetForElements({
      element: el,
      canDrop({ source }) {
        const srcPath = source.data.path;
        if (srcPath && isAncestor(srcPath, elPath)) return false;
        return true;
      },
      getData({ input, element }) {
        return { path: elPath, _isVoid: isVoid };
      },
      onDragEnter({ self, source }) {
        showCanvasDropIndicator(el, elPath, isVoid);
      },
      onDrag({ self, source }) {
        showCanvasDropIndicator(el, elPath, isVoid);
      },
      onDragLeave() {
        canvasDropLine.style.display = 'none';
        el.classList.remove('canvas-drop-target');
      },
      onDrop({ self, source }) {
        canvasDropLine.style.display = 'none';
        el.classList.remove('canvas-drop-target');

        const instruction = getCanvasDropInstruction(el, elPath, isVoid);
        if (!instruction) return;

        applyDropInstruction(instruction, source.data, elPath);
      },
    });
    canvasDndCleanups.push(cleanup);
  }
}

/**
 * Determine drop instruction based on pointer position relative to element bounds.
 * Top 25% = reorder-above, bottom 25% = reorder-below, middle 50% = make-child.
 */
function getCanvasDropInstruction(el, elPath, isVoid) {
  const rect = el.getBoundingClientRect();
  if (!lastDragInput) return null;

  const y = lastDragInput.clientY;
  const relY = (y - rect.top) / rect.height;

  // Root element can only accept make-child
  if (elPath.length === 0) {
    return { type: 'make-child' };
  }

  if (isVoid) {
    return relY < 0.5 ? { type: 'reorder-above' } : { type: 'reorder-below' };
  }

  if (relY < 0.25) return { type: 'reorder-above' };
  if (relY > 0.75) return { type: 'reorder-below' };
  return { type: 'make-child' };
}

function showCanvasDropIndicator(el, elPath, isVoid) {
  const instruction = getCanvasDropInstruction(el, elPath, isVoid);
  if (!instruction) {
    canvasDropLine.style.display = 'none';
    return;
  }

  const zoom = S.ui.zoom;
  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const left = (elRect.left - wrapRect.left + canvas.parentElement.scrollLeft) / zoom;
  const width = elRect.width / zoom;

  if (instruction.type === 'make-child') {
    canvasDropLine.style.display = 'block';
    canvasDropLine.style.top = `${(elRect.top - wrapRect.top + canvas.parentElement.scrollTop) / zoom}px`;
    canvasDropLine.style.left = `${left}px`;
    canvasDropLine.style.width = `${width}px`;
    canvasDropLine.style.height = `${elRect.height / zoom}px`;
    canvasDropLine.className = 'canvas-drop-indicator inside';
    el.classList.add('canvas-drop-target');
    return;
  }

  el.classList.remove('canvas-drop-target');
  const top = instruction.type === 'reorder-above'
    ? (elRect.top - wrapRect.top + canvas.parentElement.scrollTop) / zoom
    : (elRect.bottom - wrapRect.top + canvas.parentElement.scrollTop) / zoom;

  canvasDropLine.style.display = 'block';
  canvasDropLine.style.top = `${top}px`;
  canvasDropLine.style.left = `${left}px`;
  canvasDropLine.style.width = `${width}px`;
  canvasDropLine.style.height = '2px';
  canvasDropLine.className = 'canvas-drop-indicator line';
}

// ─── Overlay system ───────────────────────────────────────────────────────────

function renderOverlays() {
  overlay.innerHTML = '';
  // Re-attach canvasDropLine so it survives innerHTML clear
  overlay.appendChild(canvasDropLine);

  if (S.hover && !pathsEqual(S.hover, S.selection)) {
    const el = findCanvasElement(S.hover);
    if (el) drawOverlayBox(el, 'hover');
  }

  // Clean up previous drag registration
  if (selDragCleanup) { selDragCleanup(); selDragCleanup = null; }

  if (S.selection) {
    const el = findCanvasElement(S.selection);
    if (el) {
      const box = drawOverlayBox(el, 'selection');
      // Add drag handle inside the label for non-root selections
      if (S.selection.length >= 2) {
        const label = box.querySelector('.overlay-label');
        if (label) {
          const handle = document.createElement('span');
          handle.className = 'overlay-drag-handle';
          handle.textContent = '⠿';
          label.prepend(handle);

          const path = S.selection;
          selDragCleanup = draggable({
            element: handle,
            getInitialData() { return { type: 'tree-node', path }; },
          });
        }
      }
    }
  }
}

function drawOverlayBox(el, type) {
  const zoom = S.ui.zoom;
  const canvasRect = canvas.parentElement.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const box = document.createElement('div');
  box.className = `overlay-box overlay-${type}`;
  box.style.top = `${(elRect.top - canvasRect.top + canvas.parentElement.scrollTop) / zoom}px`;
  box.style.left = `${(elRect.left - canvasRect.left + canvas.parentElement.scrollLeft) / zoom}px`;
  box.style.width = `${elRect.width / zoom}px`;
  box.style.height = `${elRect.height / zoom}px`;

  if (type === 'selection') {
    const node = getNodeAtPath(S.document, S.selection);
    const label = document.createElement('div');
    label.className = 'overlay-label';
    label.textContent = nodeLabel(node);
    box.appendChild(label);
  }

  overlay.appendChild(box);
  return box;
}

function findCanvasElement(path) {
  // Walk the canvas DOM to find the element at the given path
  let el = canvas.firstElementChild; // root node
  if (!el) return null;
  if (path.length === 0) return el;

  for (let i = 0; i < path.length; i += 2) {
    // path is like ['children', 0, 'children', 2]
    if (path[i] !== 'children') return null;
    const idx = path[i + 1];
    el = el.children[idx];
    if (!el) return null;
  }
  return el;
}

// ─── Canvas click-to-select ───────────────────────────────────────────────────

/** Temporarily enable pointer events on all canvas elements, run fn, then restore */
function withCanvasPointerEvents(fn) {
  const els = canvas.querySelectorAll('*');
  for (const el of els) el.style.pointerEvents = 'auto';
  overlayClk.style.display = 'none';
  const result = fn();
  overlayClk.style.display = '';
  for (const el of els) el.style.pointerEvents = 'none';
  return result;
}

overlayClk.addEventListener('click', (e) => {
  const elements = withCanvasPointerEvents(() =>
    document.elementsFromPoint(e.clientX, e.clientY)
  );

  for (const el of elements) {
    if (canvas.contains(el) && el !== canvas) {
      const path = elToPath.get(el);
      if (path) {
        update(selectNode(S, path));
        return;
      }
    }
  }
  // Click on empty canvas = deselect
  update(selectNode(S, null));
});

overlayClk.addEventListener('contextmenu', (e) => {
  const elements = withCanvasPointerEvents(() =>
    document.elementsFromPoint(e.clientX, e.clientY)
  );

  for (const el of elements) {
    if (canvas.contains(el) && el !== canvas) {
      const path = elToPath.get(el);
      if (path) {
        showContextMenu(e, path);
        return;
      }
    }
  }
  e.preventDefault();
});

overlayClk.addEventListener('mousemove', (e) => {
  const el = withCanvasPointerEvents(() =>
    document.elementFromPoint(e.clientX, e.clientY)
  );

  if (el && canvas.contains(el) && el !== canvas) {
    const path = elToPath.get(el);
    if (path && !pathsEqual(path, S.hover)) {
      S = hoverNode(S, path);
      renderOverlays();
    }
  } else if (S.hover) {
    S = hoverNode(S, null);
    renderOverlays();
  }
});

overlayClk.addEventListener('mouseleave', () => {
  if (S.hover) {
    S = hoverNode(S, null);
    renderOverlays();
  }
});

// ─── Left panel: Layers ───────────────────────────────────────────────────────

function renderLeftPanel() {
  const tab = S.ui.leftTab;
  leftPanel.innerHTML = '';

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'panel-tabs';
  for (const t of ['layers', 'blocks']) {
    const btn = document.createElement('div');
    btn.className = `panel-tab${t === tab ? ' active' : ''}`;
    btn.textContent = t;
    btn.onclick = () => { S = { ...S, ui: { ...S.ui, leftTab: t } }; renderLeftPanel(); };
    tabs.appendChild(btn);
  }
  leftPanel.appendChild(tabs);

  const body = document.createElement('div');
  body.className = 'panel-body';
  leftPanel.appendChild(body);

  if (tab === 'layers') renderLayers(body);
  else renderBlocks(body);
}

function renderLayers(container) {
  // Clean up previous DnD registrations
  for (const fn of dndCleanups) fn();
  dndCleanups = [];

  const rows = flattenTree(S.document);
  /** @type {Set<string>} */
  const collapsed = S._collapsed || (S._collapsed = new Set());

  // Drop indicator line (positioned absolutely within container)
  container.style.position = 'relative';
  const dropLine = document.createElement('div');
  dropLine.className = 'drop-indicator';
  container.appendChild(dropLine);

  for (const { node, path, depth } of rows) {
    // Check if any ancestor is collapsed
    let hidden = false;
    for (let d = 2; d <= path.length; d += 2) {
      if (d < path.length && collapsed.has(pathKey(path.slice(0, d)))) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;

    const row = document.createElement('div');
    row.className = `layer-row${pathsEqual(path, S.selection) ? ' selected' : ''}`;
    row.dataset.path = pathKey(path);

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'layer-handle';
    handle.textContent = '⠿';
    row.appendChild(handle);

    // Indent
    const indent = document.createElement('span');
    indent.className = 'layer-indent';
    indent.style.width = `${depth * 16}px`;
    row.appendChild(indent);

    // Collapse toggle
    const toggle = document.createElement('span');
    toggle.className = 'layer-toggle';
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isVoid = VOID_ELEMENTS.has((node.tagName || 'div').toLowerCase());
    const key = pathKey(path);
    if (hasChildren) {
      toggle.textContent = collapsed.has(key) ? '▶' : '▼';
      toggle.onclick = (e) => {
        e.stopPropagation();
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
        renderLeftPanel();
      };
    }
    row.appendChild(toggle);

    // Tag badge
    const badge = document.createElement('span');
    badge.className = 'layer-tag';
    badge.textContent = node.tagName || 'div';
    row.appendChild(badge);

    // Label
    const label = document.createElement('span');
    label.className = 'layer-label';
    label.textContent = nodeLabel(node);
    row.appendChild(label);

    // Signal indicator
    if (node.$defs) {
      const hasSignals = Object.values(node.$defs).some(d => d.signal);
      if (hasSignals) {
        const dot = document.createElement('span');
        dot.className = 'layer-dot';
        dot.textContent = '⚡';
        dot.title = 'Has signals';
        row.appendChild(dot);
      }
    }

    // Delete button (not for root)
    if (path.length >= 2) {
      const del = document.createElement('span');
      del.className = 'layer-delete';
      del.textContent = '✕';
      del.title = 'Delete';
      del.onclick = (e) => {
        e.stopPropagation();
        update(removeNode(S, path));
      };
      row.appendChild(del);
    }

    row.onclick = () => update(selectNode(S, path));
    row.oncontextmenu = (e) => showContextMenu(e, path);
    container.appendChild(row);

    // ─── Register draggable + drop target ────────────────────
    const rowPath = path; // capture for closures
    const rowDepth = depth;
    const rowNode = node;

    const cleanup = combine(
      draggable({
        element: row,
        dragHandle: handle,
        getInitialData() { return { type: 'tree-node', path: rowPath }; },
        onDragStart() { row.classList.add('dragging'); },
        onDrop() { row.classList.remove('dragging'); },
      }),
      dropTargetForElements({
        element: row,
        canDrop({ source }) {
          const srcPath = source.data.path;
          // Can't drop onto self or descendant
          if (srcPath && isAncestor(srcPath, rowPath)) return false;
          return true;
        },
        getData({ input, element }) {
          return attachInstruction(
            { path: rowPath },
            {
              input,
              element,
              currentLevel: rowDepth,
              indentPerLevel: 16,
              block: isVoid ? ['make-child'] : [],
            }
          );
        },
        onDragEnter({ self }) {
          showDropIndicator(row, self.data, rowDepth, container);
        },
        onDrag({ self }) {
          showDropIndicator(row, self.data, rowDepth, container);
        },
        onDragLeave() {
          dropLine.style.display = 'none';
          row.classList.remove('drop-target');
        },
        onDrop() {
          dropLine.style.display = 'none';
          row.classList.remove('drop-target');
        },
      }),
    );
    dndCleanups.push(cleanup);
  }

  // ─── Global monitor: apply the drop ────────────────────────
  const monitorCleanup = monitorForElements({
    onDrop({ source, location }) {
      dropLine.style.display = 'none';
      const target = location.current.dropTargets[0];
      if (!target) return;

      const instruction = extractInstruction(target.data);
      if (!instruction || instruction.type === 'instruction-blocked') return;

      const srcData = source.data;
      const targetPath = target.data.path;

      applyDropInstruction(instruction, srcData, targetPath);
    },
  });
  dndCleanups.push(monitorCleanup);

  function showDropIndicator(rowEl, data, depth, container) {
    const instruction = extractInstruction(data);
    if (!instruction || instruction.type === 'instruction-blocked') {
      dropLine.style.display = 'none';
      rowEl.classList.remove('drop-target');
      return;
    }

    if (instruction.type === 'make-child') {
      dropLine.style.display = 'none';
      rowEl.classList.add('drop-target');
      return;
    }

    rowEl.classList.remove('drop-target');
    const rowRect = rowEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const indent = (instruction.type === 'reorder-above' ? depth : depth) * 16 + 28;
    const top = instruction.type === 'reorder-above'
      ? rowRect.top - containerRect.top + container.scrollTop
      : rowRect.bottom - containerRect.top + container.scrollTop;

    dropLine.style.display = 'block';
    dropLine.style.top = `${top}px`;
    dropLine.style.left = `${indent}px`;
    dropLine.style.right = '8px';
  }
}

/** Apply a DnD instruction to the state */
function applyDropInstruction(instruction, srcData, targetPath) {
  if (srcData.type === 'tree-node') {
    const fromPath = srcData.path;
    const targetParent = parentElementPath(targetPath);
    const targetIdx = childIndex(targetPath);

    switch (instruction.type) {
      case 'reorder-above':
        update(moveNode(S, fromPath, targetParent, targetIdx));
        break;
      case 'reorder-below':
        update(moveNode(S, fromPath, targetParent, targetIdx + 1));
        break;
      case 'make-child': {
        const target = getNodeAtPath(S.document, targetPath);
        const len = target?.children?.length || 0;
        update(moveNode(S, fromPath, targetPath, len));
        break;
      }
    }
  } else if (srcData.type === 'block') {
    const targetParent = parentElementPath(targetPath);
    const targetIdx = childIndex(targetPath);

    switch (instruction.type) {
      case 'reorder-above':
        update(insertNode(S, targetParent, targetIdx, structuredClone(srcData.fragment)));
        break;
      case 'reorder-below':
        update(insertNode(S, targetParent, targetIdx + 1, structuredClone(srcData.fragment)));
        break;
      case 'make-child': {
        const target = getNodeAtPath(S.document, targetPath);
        const len = target?.children?.length || 0;
        update(insertNode(S, targetPath, len, structuredClone(srcData.fragment)));
        break;
      }
    }
  }
}

function renderBlocks(container) {
  const blocks = [
    { label: 'div', def: { tagName: 'div' } },
    { label: 'section', def: { tagName: 'section' } },
    { label: 'header', def: { tagName: 'header' } },
    { label: 'footer', def: { tagName: 'footer' } },
    { label: 'nav', def: { tagName: 'nav' } },
    { label: 'h1', def: { tagName: 'h1', textContent: 'Heading' } },
    { label: 'h2', def: { tagName: 'h2', textContent: 'Heading' } },
    { label: 'h3', def: { tagName: 'h3', textContent: 'Heading' } },
    { label: 'p', def: { tagName: 'p', textContent: 'Paragraph text' } },
    { label: 'span', def: { tagName: 'span', textContent: 'Inline text' } },
    { label: 'button', def: { tagName: 'button', textContent: 'Button' } },
    { label: 'input', def: { tagName: 'input', attributes: { type: 'text', placeholder: 'Enter text...' } } },
    { label: 'textarea', def: { tagName: 'textarea' } },
    { label: 'select', def: { tagName: 'select', children: [{ tagName: 'option', textContent: 'Option 1' }] } },
    { label: 'form', def: { tagName: 'form' } },
    { label: 'img', def: { tagName: 'img', attributes: { src: '', alt: 'Image' } } },
    { label: 'a', def: { tagName: 'a', textContent: 'Link', attributes: { href: '#' } } },
    { label: 'ul', def: { tagName: 'ul', children: [{ tagName: 'li', textContent: 'Item' }] } },
    { label: 'ol', def: { tagName: 'ol', children: [{ tagName: 'li', textContent: 'Item' }] } },
    { label: 'table', def: { tagName: 'table', children: [
      { tagName: 'thead', children: [{ tagName: 'tr', children: [{ tagName: 'th', textContent: 'Header' }] }] },
      { tagName: 'tbody', children: [{ tagName: 'tr', children: [{ tagName: 'td', textContent: 'Cell' }] }] },
    ] } },
  ];

  for (const { label, def } of blocks) {
    const row = document.createElement('div');
    row.className = 'layer-row block-row';

    const badge = document.createElement('span');
    badge.className = 'layer-tag';
    badge.textContent = label;
    row.appendChild(badge);

    const lbl = document.createElement('span');
    lbl.className = 'layer-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    // Click to insert at selection
    row.onclick = () => {
      const parentPath = S.selection || [];
      const parent = getNodeAtPath(S.document, parentPath);
      const idx = parent?.children ? parent.children.length : 0;
      update(insertNode(S, parentPath, idx, structuredClone(def)));
    };

    // Also register as draggable for DnD into the layer tree
    const blockDef = def;
    const cleanup = draggable({
      element: row,
      getInitialData() { return { type: 'block', fragment: structuredClone(blockDef) }; },
    });
    dndCleanups.push(cleanup);

    container.appendChild(row);
  }
}

// ─── Right panel: Inspector ───────────────────────────────────────────────────

function renderRightPanel() {
  const tab = S.ui.rightTab;
  rightPanel.innerHTML = '';

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'panel-tabs';
  for (const t of ['properties', 'source', 'handlers']) {
    const btn = document.createElement('div');
    btn.className = `panel-tab${t === tab ? ' active' : ''}`;
    btn.textContent = t;
    btn.onclick = () => { S = { ...S, ui: { ...S.ui, rightTab: t } }; renderRightPanel(); renderOverlays(); };
    tabs.appendChild(btn);
  }
  rightPanel.appendChild(tabs);

  const body = document.createElement('div');
  body.className = 'panel-body';
  rightPanel.appendChild(body);

  if (tab === 'properties') renderInspector(body);
  else if (tab === 'source') renderSourceView(body);
  else if (tab === 'handlers') renderHandlersView(body);
}

// ─── Inspector ────────────────────────────────────────────────────────────────

function renderInspector(container) {
  if (!S.selection) {
    container.innerHTML = '<div class="empty-state">Select an element to inspect</div>';
    return;
  }

  const node = getNodeAtPath(S.document, S.selection);
  if (!node) {
    container.innerHTML = '<div class="empty-state">Node not found</div>';
    return;
  }

  renderInspectorSection(container, 'Element', true, () => {
    const fields = document.createElement('div');
    fields.className = 'inspector-fields';

    fields.appendChild(fieldRow('tagName', 'text', node.tagName || 'div', (v) => {
      update(updateProperty(S, S.selection, 'tagName', v || undefined));
    }));
    fields.appendChild(fieldRow('$id', 'text', node.$id || '', (v) => {
      update(updateProperty(S, S.selection, '$id', v || undefined));
    }));
    fields.appendChild(fieldRow('className', 'text', node.className || '', (v) => {
      update(updateProperty(S, S.selection, 'className', v || undefined));
    }));

    // textContent only when no children
    if (!Array.isArray(node.children) || node.children.length === 0) {
      const tc = typeof node.textContent === 'string' ? node.textContent
        : (node.textContent?.$ref ? `{$ref: ${node.textContent.$ref}}` : '');
      fields.appendChild(fieldRow('textContent', 'textarea', tc, (v) => {
        update(updateProperty(S, S.selection, 'textContent', v || undefined));
      }));
    }

    fields.appendChild(fieldRow('hidden', 'checkbox', !!node.hidden, (v) => {
      update(updateProperty(S, S.selection, 'hidden', v || undefined));
    }));

    return fields;
  });

  // Style section
  renderInspectorSection(container, 'Style', true, () => {
    const fields = document.createElement('div');
    fields.className = 'inspector-fields';
    const style = node.style || {};

    // Render existing style properties
    for (const [prop, val] of Object.entries(style)) {
      if (typeof val === 'object') continue; // skip nested selectors for now
      fields.appendChild(kvRow(prop, String(val),
        (newProp, newVal) => {
          if (newProp !== prop) {
            // Rename: remove old, add new
            let s = updateStyle(S, S.selection, prop, undefined);
            s = updateStyle(s, S.selection, newProp, newVal);
            update(s);
          } else {
            update(updateStyle(S, S.selection, prop, newVal));
          }
        },
        () => update(updateStyle(S, S.selection, prop, undefined))
      ));
    }

    // Add style button
    const add = document.createElement('span');
    add.className = 'kv-add';
    add.textContent = '+ Add style';
    add.onclick = () => {
      update(updateStyle(S, S.selection, 'color', '#000'));
    };
    fields.appendChild(add);
    return fields;
  });

  // Attributes section
  renderInspectorSection(container, 'Attributes', false, () => {
    const fields = document.createElement('div');
    fields.className = 'inspector-fields';
    const attrs = node.attributes || {};

    for (const [attr, val] of Object.entries(attrs)) {
      fields.appendChild(kvRow(attr, String(val),
        (newAttr, newVal) => {
          if (newAttr !== attr) {
            let s = updateAttribute(S, S.selection, attr, undefined);
            s = updateAttribute(s, S.selection, newAttr, newVal);
            update(s);
          } else {
            update(updateAttribute(S, S.selection, attr, newVal));
          }
        },
        () => update(updateAttribute(S, S.selection, attr, undefined))
      ));
    }

    const add = document.createElement('span');
    add.className = 'kv-add';
    add.textContent = '+ Add attribute';
    add.onclick = () => {
      update(updateAttribute(S, S.selection, 'data-', ''));
    };
    fields.appendChild(add);
    return fields;
  });

  // Defs section (signals + handlers)
  if (S.selection.length === 0 && node.$defs) {
    renderInspectorSection(container, 'Definitions', false, () => {
      const fields = document.createElement('div');
      fields.className = 'inspector-fields';
      for (const [name, def] of Object.entries(node.$defs)) {
        const row = document.createElement('div');
        row.className = 'def-row';

        const badge = document.createElement('span');
        badge.className = `def-badge ${def.$handler ? 'handler' : def.$compute ? 'computed' : 'signal'}`;
        badge.textContent = def.$handler ? 'H' : def.$compute ? 'C' : 'S';
        row.appendChild(badge);

        const nameEl = document.createElement('span');
        nameEl.className = 'def-name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        const del = document.createElement('span');
        del.className = 'def-del';
        del.textContent = '✕';
        del.onclick = () => update(removeDef(S, name));
        row.appendChild(del);

        fields.appendChild(row);
      }
      return fields;
    });
  }
}

/** Collapsible inspector section */
function renderInspectorSection(container, title, defaultOpen, contentFn) {
  const section = document.createElement('div');
  section.className = 'inspector-section';

  const header = document.createElement('div');
  header.className = `inspector-header${defaultOpen ? '' : ' collapsed'}`;
  header.textContent = title;

  const content = contentFn();
  if (!defaultOpen) content.classList.add('hidden');

  header.onclick = () => {
    header.classList.toggle('collapsed');
    content.classList.toggle('hidden');
  };

  section.appendChild(header);
  section.appendChild(content);
  container.appendChild(section);
}

/** Single property input row */
function fieldRow(label, type, value, onChange) {
  const row = document.createElement('div');
  row.className = 'field-row';

  const lbl = document.createElement('label');
  lbl.className = 'field-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  let input;
  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.className = 'field-input';
    input.value = value;
    let debounceTimer;
    input.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onChange(input.value), 400);
    };
  } else if (type === 'checkbox') {
    input = document.createElement('input');
    input.className = 'field-input';
    input.type = 'checkbox';
    input.checked = !!value;
    input.onchange = () => onChange(input.checked);
  } else {
    input = document.createElement('input');
    input.className = 'field-input';
    input.type = type;
    input.value = value;
    let debounceTimer;
    input.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onChange(input.value), 400);
    };
  }
  row.appendChild(input);
  return row;
}

/** Key-value pair row for styles / attributes */
function kvRow(key, value, onChange, onDelete) {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const keyInput = document.createElement('input');
  keyInput.className = 'field-input kv-key';
  keyInput.value = key;

  const valInput = document.createElement('input');
  valInput.className = 'field-input kv-val';
  valInput.value = value;

  let debounceTimer;
  const commit = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onChange(keyInput.value, valInput.value), 400);
  };
  keyInput.oninput = commit;
  valInput.oninput = commit;

  const del = document.createElement('span');
  del.className = 'kv-del';
  del.textContent = '✕';
  del.onclick = onDelete;

  row.appendChild(keyInput);
  row.appendChild(valInput);
  row.appendChild(del);
  return row;
}

// ─── Source view ──────────────────────────────────────────────────────────────

function renderSourceView(container) {
  if (!S.selection) {
    const ta = document.createElement('textarea');
    ta.id = 'source-view';
    ta.value = JSON.stringify(S.document, null, 2);
    ta.onblur = () => {
      try {
        const parsed = JSON.parse(ta.value);
        S = { ...S, document: parsed, dirty: true };
        render();
      } catch {}
    };
    container.appendChild(ta);
    return;
  }

  const node = getNodeAtPath(S.document, S.selection);
  const ta = document.createElement('textarea');
  ta.id = 'source-view';
  ta.value = JSON.stringify(node, null, 2);
  ta.readOnly = true;
  container.appendChild(ta);
}

// ─── Handlers view ────────────────────────────────────────────────────────────

function renderHandlersView(container) {
  if (S.handlersSource) {
    const ta = document.createElement('textarea');
    ta.id = 'source-view';
    ta.value = S.handlersSource;
    ta.readOnly = true;
    container.appendChild(ta);
  } else {
    container.innerHTML = '<div class="empty-state">No companion .js file loaded</div>';
  }
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function renderToolbar() {
  toolbar.innerHTML = '';

  // File group
  const fileGroup = group();
  fileGroup.appendChild(tbBtn('Open', openFile));
  fileGroup.appendChild(tbBtn('Save', saveFile));
  if (S.fileHandle) {
    const fname = document.createElement('span');
    fname.className = 'tb-filename';
    fname.textContent = S.fileHandle.name;
    fileGroup.appendChild(fname);
  }
  if (S.dirty) {
    const dot = document.createElement('span');
    dot.className = 'tb-dirty';
    dot.textContent = '●';
    fileGroup.appendChild(dot);
  }
  toolbar.appendChild(fileGroup);

  // Edit group
  const editGroup = group();
  editGroup.appendChild(tbBtn('Undo', () => update(undo(S))));
  editGroup.appendChild(tbBtn('Redo', () => update(redo(S))));
  toolbar.appendChild(editGroup);

  // Insert group
  const insertGroup = group();
  insertGroup.appendChild(tbBtn('Duplicate', () => {
    if (S.selection) update(duplicateNode(S, S.selection));
  }));
  insertGroup.appendChild(tbBtn('Delete', () => {
    if (S.selection) update(removeNode(S, S.selection));
  }));
  toolbar.appendChild(insertGroup);

  // Zoom group
  const zoomGroup = group();
  zoomGroup.appendChild(tbBtn('−', () => {
    S = { ...S, ui: { ...S.ui, zoom: Math.max(0.25, S.ui.zoom - 0.25) } };
    renderCanvas(); renderOverlays();
  }));
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'tb-filename';
  zoomLabel.textContent = `${Math.round(S.ui.zoom * 100)}%`;
  zoomGroup.appendChild(zoomLabel);
  zoomGroup.appendChild(tbBtn('+', () => {
    S = { ...S, ui: { ...S.ui, zoom: Math.min(4, S.ui.zoom + 0.25) } };
    renderCanvas(); renderOverlays();
  }));
  toolbar.appendChild(zoomGroup);

  // Spacer
  const spacer = document.createElement('div');
  spacer.className = 'tb-spacer';
  toolbar.appendChild(spacer);

  // Export group
  const exportGroup = group();
  exportGroup.appendChild(tbBtn('Copy JSON', async () => {
    await navigator.clipboard.writeText(JSON.stringify(S.document, null, 2));
    statusMessage('Copied to clipboard');
  }));
  toolbar.appendChild(exportGroup);
}

function group() {
  const g = document.createElement('div');
  g.className = 'tb-group';
  return g;
}

function tbBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'tb-btn';
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

// ─── Statusbar ────────────────────────────────────────────────────────────────


function renderStatusbar() {
  const parts = [];
  if (S.selection) {
    const node = getNodeAtPath(S.document, S.selection);
    parts.push(`Selected: ${nodeLabel(node)}`);
    parts.push(`Path: ${S.selection.join(' > ') || 'root'}`);
  }
  if (statusMsg) parts.push(statusMsg);
  statusbar.textContent = parts.join('  |  ') || 'JSONsx Studio';
}

function statusMessage(msg, duration = 3000) {
  statusMsg = msg;
  renderStatusbar();
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => { statusMsg = ''; renderStatusbar(); }, duration);
}

// ─── File Operations ──────────────────────────────────────────────────────────

async function openFile() {
  try {
    // File System Access API
    if ('showOpenFilePicker' in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSONsx Component', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      const doc = JSON.parse(text);
      S = createState(doc);
      S.fileHandle = handle;
      S.dirty = false;

      // Try to load companion .js file
      await loadCompanionJS(handle);

      render();
      statusMessage(`Opened ${handle.name}`);
    } else {
      // Fallback: file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const text = await file.text();
        const doc = JSON.parse(text);
        S = createState(doc);
        S.dirty = false;
        render();
        statusMessage(`Opened ${file.name}`);
      };
      input.click();
    }
  } catch (e) {
    if (e.name !== 'AbortError') statusMessage(`Error: ${e.message}`);
  }
}

async function loadCompanionJS(handle) {
  try {
    // Try to get the parent directory to look for .js file
    // Note: getParent is not widely supported; best-effort
    const name = handle.name.replace(/\.json$/, '.js');
    if (handle.getParent) {
      // Not yet available in any browser; skip for now
    }
    // Check $handlers in the document
    if (S.document.$handlers) {
      S.handlersSource = `// Companion file: ${S.document.$handlers}\n// (Read-only in builder — edit the JS file directly)`;
    }
  } catch {}
}

async function saveFile() {
  try {
    const json = JSON.stringify(S.document, null, 2);

    if (S.fileHandle && 'createWritable' in S.fileHandle) {
      const writable = await S.fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      S = { ...S, dirty: false };
      renderToolbar();
      statusMessage('Saved');
    } else if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'component.json',
        types: [{ description: 'JSONsx Component', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      S = { ...S, fileHandle: handle, dirty: false };
      renderToolbar();
      statusMessage(`Saved as ${handle.name}`);
    } else {
      // Fallback: download
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'component.json';
      a.click();
      URL.revokeObjectURL(url);
      S = { ...S, dirty: false };
      renderToolbar();
      statusMessage('Downloaded');
    }
  } catch (e) {
    if (e.name !== 'AbortError') statusMessage(`Save error: ${e.message}`);
  }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;

  // Don't intercept when typing in inputs
  if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) {
    if (mod && e.key === 's') { e.preventDefault(); saveFile(); }
    return;
  }

  if (mod) {
    switch (e.key) {
      case 'o': e.preventDefault(); openFile(); break;
      case 's': e.preventDefault(); saveFile(); break;
      case 'z':
        e.preventDefault();
        update(e.shiftKey ? redo(S) : undo(S));
        break;
      case 'd':
        e.preventDefault();
        if (S.selection) update(duplicateNode(S, S.selection));
        break;
      case 'c':
        e.preventDefault();
        copyNode();
        break;
      case 'x':
        e.preventDefault();
        cutNode();
        break;
      case 'v':
        e.preventDefault();
        pasteNode();
        break;
      case '0':
        e.preventDefault();
        S = { ...S, ui: { ...S.ui, zoom: 1 } };
        renderCanvas(); renderOverlays();
        break;
      case '=': case '+':
        e.preventDefault();
        S = { ...S, ui: { ...S.ui, zoom: Math.min(4, S.ui.zoom + 0.25) } };
        renderCanvas(); renderOverlays();
        break;
      case '-':
        e.preventDefault();
        S = { ...S, ui: { ...S.ui, zoom: Math.max(0.25, S.ui.zoom - 0.25) } };
        renderCanvas(); renderOverlays();
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (S.selection && S.selection.length >= 2) {
        e.preventDefault();
        update(removeNode(S, S.selection));
      }
      break;
    case 'Escape':
      update(selectNode(S, null));
      break;
    case 'ArrowUp':
      e.preventDefault();
      navigateSelection(-1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      navigateSelection(1);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (S.selection && S.selection.length >= 2) {
        update(selectNode(S, parentElementPath(S.selection)));
      }
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (S.selection) {
        const node = getNodeAtPath(S.document, S.selection);
        if (node?.children?.length > 0) {
          update(selectNode(S, [...S.selection, 'children', 0]));
        }
      }
      break;
  }
});

function navigateSelection(direction) {
  if (!S.selection) {
    update(selectNode(S, []));
    return;
  }
  if (S.selection.length < 2) return; // can't navigate from root

  const parent = getNodeAtPath(S.document, parentElementPath(S.selection));
  const idx = childIndex(S.selection);
  const newIdx = idx + direction;

  if (newIdx >= 0 && newIdx < parent.children.length) {
    const newPath = [...parentElementPath(S.selection), 'children', newIdx];
    update(selectNode(S, newPath));
  }
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

let clipboard = null;

function copyNode() {
  if (!S.selection) return;
  const node = getNodeAtPath(S.document, S.selection);
  if (!node) return;
  clipboard = structuredClone(node);
  statusMessage('Copied');
}

function cutNode() {
  if (!S.selection || S.selection.length < 2) return;
  const node = getNodeAtPath(S.document, S.selection);
  if (!node) return;
  clipboard = structuredClone(node);
  update(removeNode(S, S.selection));
  statusMessage('Cut');
}

function pasteNode() {
  if (!clipboard) return;
  const parentPath = S.selection || [];
  const parent = getNodeAtPath(S.document, parentPath);
  if (!parent) return;

  if (S.selection && S.selection.length >= 2) {
    // Paste as sibling after selection
    const pp = parentElementPath(S.selection);
    const idx = childIndex(S.selection);
    update(insertNode(S, pp, idx + 1, structuredClone(clipboard)));
  } else {
    // Paste as last child of root/selected
    const idx = parent.children ? parent.children.length : 0;
    update(insertNode(S, parentPath, idx, structuredClone(clipboard)));
  }
  statusMessage('Pasted');
}

// ─── Context menu ─────────────────────────────────────────────────────────────

const ctxMenu = document.createElement('div');
ctxMenu.className = 'ctx-menu';
ctxMenu.style.display = 'none';
document.body.appendChild(ctxMenu);

document.addEventListener('click', () => { ctxMenu.style.display = 'none'; });

function showContextMenu(e, path) {
  e.preventDefault();
  ctxMenu.style.display = 'none';

  const node = getNodeAtPath(S.document, path);
  if (!node) return;

  // Select the node
  update(selectNode(S, path));

  ctxMenu.innerHTML = '';
  const items = [];

  items.push({ label: 'Copy', action: copyNode });
  if (path.length >= 2) {
    items.push({ label: 'Cut', action: cutNode });
    items.push({ label: 'Duplicate', action: () => update(duplicateNode(S, S.selection)) });
    items.push({ label: '—' }); // separator
    items.push({ label: 'Delete', action: () => update(removeNode(S, S.selection)), danger: true });
  }
  if (clipboard) {
    items.push({ label: '—' });
    items.push({ label: 'Paste inside', action: () => {
      const idx = node.children ? node.children.length : 0;
      update(insertNode(S, path, idx, structuredClone(clipboard)));
    }});
    if (path.length >= 2) {
      items.push({ label: 'Paste after', action: () => {
        const pp = parentElementPath(path);
        const idx = childIndex(path);
        update(insertNode(S, pp, idx + 1, structuredClone(clipboard)));
      }});
    }
  }

  for (const item of items) {
    if (item.label === '—') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxMenu.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.className = `ctx-item${item.danger ? ' danger' : ''}`;
    el.textContent = item.label;
    el.onclick = () => { ctxMenu.style.display = 'none'; item.action(); };
    ctxMenu.appendChild(el);
  }

  // Position the menu
  ctxMenu.style.display = 'block';
  const menuRect = ctxMenu.getBoundingClientRect();
  let x = e.clientX, y = e.clientY;
  if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 4;
  if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 4;
  ctxMenu.style.left = `${x}px`;
  ctxMenu.style.top = `${y}px`;
}

// ─── Autosave ─────────────────────────────────────────────────────────────────

let autosaveTimer;
const AUTO_SAVE_DELAY = 2000;

function scheduleAutosave() {
  if (!S.fileHandle || !S.dirty) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (S.fileHandle && S.dirty && 'createWritable' in S.fileHandle) {
      try {
        const writable = await S.fileHandle.createWritable();
        await writable.write(JSON.stringify(S.document, null, 2));
        await writable.close();
        S = { ...S, dirty: false };
        renderToolbar();
        statusMessage('Auto-saved');
      } catch {}
    }
  }, AUTO_SAVE_DELAY);
}

// Hook autosave into update
const _origUpdate = update;
update = function(newState) {
  _origUpdate(newState);
  if (S.dirty) scheduleAutosave();
};
