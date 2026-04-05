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
  updateMediaStyle, updateMedia,
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

import webdata from './webdata.json';

// ─── Globals ──────────────────────────────────────────────────────────────────

let S; // current state
let statusMsg = '';
let statusTimeout;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const canvasWrap = $('#canvas-wrap');
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

/** Void elements that cannot accept children */
const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr',
]);

/**
 * Canvas panels: Array<{ mediaName, canvas, overlay, overlayClk, viewport, dropLine }>
 * Built dynamically in renderCanvas() based on $media definitions.
 */
let canvasPanels = [];

// ─── Webdata: datalists for autocomplete ──────────────────────────────────────

const tagNameList = document.createElement('datalist');
tagNameList.id = 'tag-names';
for (const tag of webdata.allTags) {
  const opt = document.createElement('option');
  opt.value = tag;
  tagNameList.appendChild(opt);
}
document.body.appendChild(tagNameList);

const cssPropList = document.createElement('datalist');
cssPropList.id = 'css-props';
for (const [name] of webdata.cssProps) {
  const opt = document.createElement('option');
  opt.value = name;
  cssPropList.appendChild(opt);
}
document.body.appendChild(cssPropList);

/** Map<camelCaseName, initialValue> for placeholder hints */
const cssInitialMap = new Map(webdata.cssProps);

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

// ─── Media helpers ────────────────────────────────────────────────────────────

/**
 * Classify $media entries into size breakpoints (get a canvas each)
 * and feature queries (rendered as toolbar toggles).
 */
function parseMediaEntries(mediaDef) {
  if (!mediaDef) return { sizeBreakpoints: [], featureQueries: [] };
  const sizes = [], features = [];
  for (const [name, query] of Object.entries(mediaDef)) {
    const minMatch = query.match(/min-width:\s*([\d.]+)px/);
    const maxMatch = query.match(/max-width:\s*([\d.]+)px/);
    if (minMatch) sizes.push({ name, query, width: parseFloat(minMatch[1]), type: 'min' });
    else if (maxMatch) sizes.push({ name, query, width: parseFloat(maxMatch[1]), type: 'max' });
    else features.push({ name, query });
  }
  sizes.sort((a, b) => a.type === 'min' ? a.width - b.width : b.width - a.width);
  return { sizeBreakpoints: sizes, featureQueries: features };
}

/**
 * Compute which named breakpoints are active at a given canvas width.
 * For min-width canvases: all breakpoints with min-width <= canvasWidth are active.
 * For max-width canvases: all breakpoints with max-width >= canvasWidth are active.
 */
function activeBreakpointsForWidth(sizeBreakpoints, canvasWidth) {
  const active = new Set();
  for (const bp of sizeBreakpoints) {
    if (bp.type === 'min' && canvasWidth >= bp.width) active.add(bp.name);
    else if (bp.type === 'max' && canvasWidth <= bp.width) active.add(bp.name);
  }
  return active;
}

/**
 * Apply styles to a canvas element, including active media overrides.
 * Base (flat) styles applied first, then matching media overrides in source order.
 */
function applyCanvasStyle(el, styleDef, activeBreakpoints, featureToggles) {
  if (!styleDef || typeof styleDef !== 'object') return;
  for (const [prop, val] of Object.entries(styleDef)) {
    if (typeof val === 'string' || typeof val === 'number') {
      try { el.style[prop] = val; } catch {}
    }
  }
  for (const [key, val] of Object.entries(styleDef)) {
    if (!key.startsWith('@') || typeof val !== 'object') continue;
    const mediaName = key.slice(1);
    if (activeBreakpoints.has(mediaName) || featureToggles[mediaName]) {
      for (const [prop, v] of Object.entries(val)) {
        if (typeof v === 'string' || typeof v === 'number') {
          try { el.style[prop] = v; } catch {}
        }
      }
    }
  }
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function renderCanvas() {
  // Clean up previous canvas DnD registrations
  for (const fn of canvasDndCleanups) fn();
  canvasDndCleanups = [];
  canvasPanels = [];
  canvasWrap.innerHTML = '';

  const { sizeBreakpoints, featureQueries } = parseMediaEntries(S.document.$media);
  const hasMedia = sizeBreakpoints.length > 0;
  const featureToggles = S.ui.featureToggles;

  if (!hasMedia) {
    // Single full-width canvas (backward-compatible)
    const panel = createCanvasPanel(null, null, true);
    canvasWrap.appendChild(panel.element);
    canvasPanels.push(panel);
    renderCanvasNode(S.document, [], panel.canvas, new Set(), featureToggles);
    registerPanelDnD(panel);
    registerPanelEvents(panel);
    return;
  }

  // Base canvas (mobile-first default: 320px)
  const baseWidth = sizeBreakpoints[0].type === 'min' ? 320 : sizeBreakpoints[0].width;
  const baseActive = activeBreakpointsForWidth(sizeBreakpoints, baseWidth);
  const basePanel = createCanvasPanel('base', `Base (${baseWidth}px)`, false, baseWidth);
  canvasWrap.appendChild(basePanel.element);
  canvasPanels.push(basePanel);
  renderCanvasNode(S.document, [], basePanel.canvas, baseActive, featureToggles);
  registerPanelDnD(basePanel);
  registerPanelEvents(basePanel);

  // One panel per size breakpoint
  for (const bp of sizeBreakpoints) {
    const active = activeBreakpointsForWidth(sizeBreakpoints, bp.width);
    const label = `${bp.name} (${bp.width}px)`;
    const panel = createCanvasPanel(bp.name, label, false, bp.width);
    canvasWrap.appendChild(panel.element);
    canvasPanels.push(panel);
    renderCanvasNode(S.document, [], panel.canvas, active, featureToggles);
    registerPanelDnD(panel);
    registerPanelEvents(panel);
  }

  // Highlight active panel header
  updateActivePanelHeaders();
}

/**
 * Create a canvas panel DOM structure.
 * Returns { mediaName, element, canvas, overlay, overlayClk, viewport, dropLine }
 */
function createCanvasPanel(mediaName, label, fullWidth, width) {
  const panel = document.createElement('div');
  panel.className = `canvas-panel${fullWidth ? ' full-width' : ''}`;
  if (mediaName !== null) panel.dataset.media = mediaName;

  if (label) {
    const header = document.createElement('div');
    header.className = 'canvas-panel-header';
    header.textContent = label;
    header.onclick = () => {
      S = { ...S, ui: { ...S.ui, activeMedia: mediaName === 'base' ? null : mediaName } };
      updateActivePanelHeaders();
      renderRightPanel();
    };
    panel.appendChild(header);
  }

  const viewport = document.createElement('div');
  viewport.className = 'canvas-panel-viewport';
  if (width && !fullWidth) viewport.style.width = `${width * S.ui.zoom}px`;

  const canvasDiv = document.createElement('div');
  canvasDiv.className = 'canvas-panel-canvas';
  canvasDiv.style.zoom = S.ui.zoom;
  canvasDiv.style.width = width ? `${width}px` : '';

  const overlayDiv = document.createElement('div');
  overlayDiv.className = 'canvas-panel-overlay';

  const dropLine = document.createElement('div');
  dropLine.className = 'canvas-drop-indicator';
  dropLine.style.display = 'none';
  overlayDiv.appendChild(dropLine);

  const clickDiv = document.createElement('div');
  clickDiv.className = 'canvas-panel-click';

  viewport.appendChild(canvasDiv);
  viewport.appendChild(overlayDiv);
  viewport.appendChild(clickDiv);
  panel.appendChild(viewport);

  return { mediaName, element: panel, canvas: canvasDiv, overlay: overlayDiv, overlayClk: clickDiv, viewport, dropLine };
}

function updateActivePanelHeaders() {
  for (const p of canvasPanels) {
    const header = p.element.querySelector('.canvas-panel-header');
    if (header) {
      const isActive = (S.ui.activeMedia === null && p.mediaName === 'base') ||
                        (S.ui.activeMedia === null && p.mediaName === null) ||
                        (S.ui.activeMedia === p.mediaName);
      header.classList.toggle('active', isActive);
    }
  }
}

/**
 * Recursively render a JSONsx node to the canvas DOM.
 * Media-aware: applies base styles + active breakpoint/feature overrides.
 */
function renderCanvasNode(node, path, parent, activeBreakpoints, featureToggles) {
  if (!node || typeof node !== 'object') return;

  const tag = node.tagName || 'div';
  const el = document.createElement(tag);

  elToPath.set(el, path);

  if (typeof node.textContent === 'string') {
    el.textContent = node.textContent;
  } else if (typeof node.textContent === 'object' && node.textContent?.$ref) {
    el.textContent = `{${node.textContent.$ref}}`;
    el.style.opacity = '0.6';
    el.style.fontStyle = 'italic';
  }

  if (node.id) el.id = node.id;
  if (node.className) el.className = node.className;

  applyCanvasStyle(el, node.style, activeBreakpoints, featureToggles);

  if (node.attributes && typeof node.attributes === 'object') {
    for (const [attr, val] of Object.entries(node.attributes)) {
      try { el.setAttribute(attr, val); } catch {}
    }
  }

  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      renderCanvasNode(node.children[i], [...path, 'children', i], el, activeBreakpoints, featureToggles);
    }
  }

  el.style.pointerEvents = 'none';
  parent.appendChild(el);
  return el;
}

/** Track the last drag pointer position for canvas drop calculations */
let lastDragInput = null;

/**
 * Register all canvas elements in a panel as DnD drop targets.
 */
function registerPanelDnD(panel) {
  const { canvas, overlayClk, dropLine } = panel;
  const allEls = canvas.querySelectorAll('*');

  const monitorCleanup = monitorForElements({
    onDragStart() {
      for (const el of canvas.querySelectorAll('*')) {
        el.style.pointerEvents = 'auto';
      }
      // Disable click layers on ALL panels during drag
      for (const p of canvasPanels) p.overlayClk.style.pointerEvents = 'none';
    },
    onDrag({ location }) {
      lastDragInput = location.current.input;
    },
    onDrop() {
      // Hide all drop lines
      for (const p of canvasPanels) p.dropLine.style.display = 'none';
      lastDragInput = null;
      for (const el of canvas.querySelectorAll('*')) {
        el.style.pointerEvents = 'none';
      }
      for (const p of canvasPanels) p.overlayClk.style.pointerEvents = '';
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
      getData() {
        return { path: elPath, _isVoid: isVoid };
      },
      onDragEnter() {
        showCanvasDropIndicator(el, elPath, isVoid, panel);
      },
      onDrag() {
        showCanvasDropIndicator(el, elPath, isVoid, panel);
      },
      onDragLeave() {
        dropLine.style.display = 'none';
        el.classList.remove('canvas-drop-target');
      },
      onDrop({ source }) {
        dropLine.style.display = 'none';
        el.classList.remove('canvas-drop-target');
        const instruction = getCanvasDropInstruction(el, elPath, isVoid);
        if (!instruction) return;
        applyDropInstruction(instruction, source.data, elPath);
      },
    });
    canvasDndCleanups.push(cleanup);
  }
}

function getCanvasDropInstruction(el, elPath, isVoid) {
  const rect = el.getBoundingClientRect();
  if (!lastDragInput) return null;
  const y = lastDragInput.clientY;
  const relY = (y - rect.top) / rect.height;

  if (elPath.length === 0) return { type: 'make-child' };
  if (isVoid) return relY < 0.5 ? { type: 'reorder-above' } : { type: 'reorder-below' };
  if (relY < 0.25) return { type: 'reorder-above' };
  if (relY > 0.75) return { type: 'reorder-below' };
  return { type: 'make-child' };
}

function showCanvasDropIndicator(el, elPath, isVoid, panel) {
  const instruction = getCanvasDropInstruction(el, elPath, isVoid);
  const { dropLine, viewport } = panel;
  if (!instruction) { dropLine.style.display = 'none'; return; }

  const wrapRect = viewport.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const left = elRect.left - wrapRect.left + viewport.scrollLeft;
  const width = elRect.width;

  if (instruction.type === 'make-child') {
    dropLine.style.display = 'block';
    dropLine.style.top = `${elRect.top - wrapRect.top + viewport.scrollTop}px`;
    dropLine.style.left = `${left}px`;
    dropLine.style.width = `${width}px`;
    dropLine.style.height = `${elRect.height}px`;
    dropLine.className = 'canvas-drop-indicator inside';
    el.classList.add('canvas-drop-target');
    return;
  }

  el.classList.remove('canvas-drop-target');
  const top = instruction.type === 'reorder-above'
    ? elRect.top - wrapRect.top + viewport.scrollTop
    : elRect.bottom - wrapRect.top + viewport.scrollTop;

  dropLine.style.display = 'block';
  dropLine.style.top = `${top}px`;
  dropLine.style.left = `${left}px`;
  dropLine.style.width = `${width}px`;
  dropLine.style.height = '2px';
  dropLine.className = 'canvas-drop-indicator line';
}

// ─── Overlay system ───────────────────────────────────────────────────────────

function renderOverlays() {
  // Clear all panel overlays
  for (const p of canvasPanels) {
    p.overlay.innerHTML = '';
    p.overlay.appendChild(p.dropLine);
  }

  if (selDragCleanup) { selDragCleanup(); selDragCleanup = null; }

  // Draw hover overlay on whichever panel the hover is on
  if (S.hover && !pathsEqual(S.hover, S.selection)) {
    for (const p of canvasPanels) {
      const el = findCanvasElement(S.hover, p.canvas);
      if (el) drawOverlayBox(el, 'hover', p);
    }
  }

  // Draw selection overlay only on the active panel
  if (S.selection) {
    const activePanel = getActivePanel();
    if (activePanel) {
      const el = findCanvasElement(S.selection, activePanel.canvas);
      if (el) {
        const box = drawOverlayBox(el, 'selection', activePanel);
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
}

function getActivePanel() {
  if (canvasPanels.length === 0) return null;
  if (canvasPanels.length === 1) return canvasPanels[0];
  for (const p of canvasPanels) {
    if (S.ui.activeMedia === null && (p.mediaName === 'base' || p.mediaName === null)) return p;
    if (p.mediaName === S.ui.activeMedia) return p;
  }
  return canvasPanels[0];
}

function drawOverlayBox(el, type, panel) {
  const vpRect = panel.viewport.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const box = document.createElement('div');
  box.className = `overlay-box overlay-${type}`;
  box.style.top = `${elRect.top - vpRect.top + panel.viewport.scrollTop}px`;
  box.style.left = `${elRect.left - vpRect.left + panel.viewport.scrollLeft}px`;
  box.style.width = `${elRect.width}px`;
  box.style.height = `${elRect.height}px`;

  if (type === 'selection') {
    const node = getNodeAtPath(S.document, S.selection);
    const label = document.createElement('div');
    label.className = 'overlay-label';
    label.textContent = nodeLabel(node);
    box.appendChild(label);
  }

  panel.overlay.appendChild(box);
  return box;
}

function findCanvasElement(path, canvasEl) {
  let el = canvasEl.firstElementChild;
  if (!el) return null;
  if (path.length === 0) return el;

  for (let i = 0; i < path.length; i += 2) {
    if (path[i] !== 'children') return null;
    const idx = path[i + 1];
    el = el.children[idx];
    if (!el) return null;
  }
  return el;
}

// ─── Per-panel click-to-select ────────────────────────────────────────────────

function registerPanelEvents(panel) {
  const { canvas, overlayClk, mediaName } = panel;

  function withPanelPointerEvents(fn) {
    const els = canvas.querySelectorAll('*');
    for (const el of els) el.style.pointerEvents = 'auto';
    overlayClk.style.display = 'none';
    const result = fn();
    overlayClk.style.display = '';
    for (const el of els) el.style.pointerEvents = 'none';
    return result;
  }

  overlayClk.addEventListener('click', (e) => {
    const elements = withPanelPointerEvents(() =>
      document.elementsFromPoint(e.clientX, e.clientY)
    );
    for (const el of elements) {
      if (canvas.contains(el) && el !== canvas) {
        const path = elToPath.get(el);
        if (path) {
          const newMedia = mediaName === 'base' ? null : (mediaName ?? null);
          S = { ...S, ui: { ...S.ui, activeMedia: newMedia } };
          update(selectNode(S, path));
          return;
        }
      }
    }
    update(selectNode(S, null));
  });

  overlayClk.addEventListener('contextmenu', (e) => {
    const elements = withPanelPointerEvents(() =>
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
    const el = withPanelPointerEvents(() =>
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
}

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

/** Generate a sensible default JSONsx node for a given tag name */
function defaultDef(tag) {
  const def = { tagName: tag };
  if (/^h[1-6]$/.test(tag)) def.textContent = 'Heading';
  else if (tag === 'p') def.textContent = 'Paragraph text';
  else if (tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'small'
    || tag === 'mark' || tag === 'code' || tag === 'abbr' || tag === 'q'
    || tag === 'sub' || tag === 'sup' || tag === 'time') def.textContent = 'Text';
  else if (tag === 'a') { def.textContent = 'Link'; def.attributes = { href: '#' }; }
  else if (tag === 'button') def.textContent = 'Button';
  else if (tag === 'label') def.textContent = 'Label';
  else if (tag === 'legend') def.textContent = 'Legend';
  else if (tag === 'caption') def.textContent = 'Caption';
  else if (tag === 'summary') def.textContent = 'Summary';
  else if (tag === 'li' || tag === 'dt' || tag === 'dd' || tag === 'th' || tag === 'td'
    || tag === 'option') def.textContent = 'Item';
  else if (tag === 'blockquote') def.textContent = 'Quote';
  else if (tag === 'pre') def.textContent = 'Preformatted text';
  else if (tag === 'input') def.attributes = { type: 'text', placeholder: 'Enter text...' };
  else if (tag === 'img') def.attributes = { src: '', alt: 'Image' };
  else if (tag === 'iframe') def.attributes = { src: '' };
  else if (tag === 'select') def.children = [{ tagName: 'option', textContent: 'Option 1' }];
  else if (tag === 'ul' || tag === 'ol') def.children = [{ tagName: 'li', textContent: 'Item' }];
  else if (tag === 'dl') def.children = [
    { tagName: 'dt', textContent: 'Term' },
    { tagName: 'dd', textContent: 'Definition' },
  ];
  else if (tag === 'table') def.children = [
    { tagName: 'thead', children: [{ tagName: 'tr', children: [{ tagName: 'th', textContent: 'Header' }] }] },
    { tagName: 'tbody', children: [{ tagName: 'tr', children: [{ tagName: 'td', textContent: 'Cell' }] }] },
  ];
  else if (tag === 'details') def.children = [
    { tagName: 'summary', textContent: 'Summary' },
    { tagName: 'p', textContent: 'Detail content' },
  ];
  return def;
}

function renderBlocks(container) {
  // Search filter
  const search = document.createElement('input');
  search.className = 'field-input blocks-search';
  search.placeholder = 'Filter elements…';
  container.appendChild(search);

  const list = document.createElement('div');
  container.appendChild(list);

  /** Collapsed category state (persists across re-renders via closure) */
  const collapsed = new Set();

  function renderList(filter) {
    list.innerHTML = '';

    for (const [category, elements] of Object.entries(webdata.elements)) {
      const filtered = filter
        ? elements.filter(e => e.tag.includes(filter))
        : elements;
      if (filtered.length === 0) continue;

      // Category header
      const header = document.createElement('div');
      header.className = `blocks-category${collapsed.has(category) ? ' collapsed' : ''}`;
      header.textContent = category;
      header.onclick = () => {
        if (collapsed.has(category)) collapsed.delete(category);
        else collapsed.add(category);
        renderList(search.value.toLowerCase());
      };
      list.appendChild(header);

      if (collapsed.has(category)) continue;

      for (const { tag } of filtered) {
        const def = defaultDef(tag);
        const row = document.createElement('div');
        row.className = 'block-row';

        // Live preview of the element
        const preview = document.createElement('div');
        preview.className = 'block-preview';
        const el = document.createElement(tag);
        el.textContent = tag;
        preview.appendChild(el);
        row.appendChild(preview);

        // Tag label below preview
        const lbl = document.createElement('div');
        lbl.className = 'block-label';
        lbl.textContent = `<${tag}>`;
        row.appendChild(lbl);

        row.onclick = () => {
          const parentPath = S.selection || [];
          const parent = getNodeAtPath(S.document, parentPath);
          const idx = parent?.children ? parent.children.length : 0;
          update(insertNode(S, parentPath, idx, structuredClone(def)));
        };

        const blockDef = def;
        const cleanup = draggable({
          element: row,
          getInitialData() { return { type: 'block', fragment: structuredClone(blockDef) }; },
        });
        dndCleanups.push(cleanup);

        list.appendChild(row);
      }
    }
  }

  search.oninput = () => renderList(search.value.toLowerCase());
  renderList('');
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
    }, 'tag-names'));
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

  // Style section (media-tabbed)
  renderInspectorSection(container, 'Style', true, () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-fields';
    const style = node.style || {};
    const { sizeBreakpoints } = parseMediaEntries(S.document.$media);
    const mediaNames = sizeBreakpoints.map(bp => bp.name);
    const activeTab = S.ui.activeMedia; // null = base

    // Media tabs (only if there are breakpoints)
    if (mediaNames.length > 0) {
      const tabs = document.createElement('div');
      tabs.className = 'media-tabs';

      const baseTab = document.createElement('div');
      baseTab.className = `media-tab${activeTab === null ? ' active' : ''}`;
      baseTab.textContent = 'Base';
      baseTab.onclick = () => {
        S = { ...S, ui: { ...S.ui, activeMedia: null } };
        updateActivePanelHeaders();
        renderRightPanel();
      };
      tabs.appendChild(baseTab);

      for (const name of mediaNames) {
        const tab = document.createElement('div');
        tab.className = `media-tab${activeTab === name ? ' active' : ''}`;
        tab.textContent = name;
        tab.onclick = () => {
          S = { ...S, ui: { ...S.ui, activeMedia: name } };
          updateActivePanelHeaders();
          renderRightPanel();
        };
        tabs.appendChild(tab);
      }
      wrapper.appendChild(tabs);
    }

    if (activeTab === null || mediaNames.length === 0) {
      // Base styles: flat key-value pairs
      for (const [prop, val] of Object.entries(style)) {
        if (typeof val === 'object') continue;
        wrapper.appendChild(kvRow(prop, String(val),
          (newProp, newVal) => {
            if (newProp !== prop) {
              let s = updateStyle(S, S.selection, prop, undefined);
              s = updateStyle(s, S.selection, newProp, newVal);
              update(s);
            } else {
              update(updateStyle(S, S.selection, prop, newVal));
            }
          },
          () => update(updateStyle(S, S.selection, prop, undefined)),
          'css-props'
        ));
      }

      const add = document.createElement('span');
      add.className = 'kv-add';
      add.textContent = '+ Add style';
      add.onclick = () => update(updateStyle(S, S.selection, 'color', '#000'));
      wrapper.appendChild(add);
    } else {
      // Media-specific styles: contents of @--name
      const mediaKey = `@${activeTab}`;
      const mediaStyles = style[mediaKey] || {};

      for (const [prop, val] of Object.entries(mediaStyles)) {
        if (typeof val === 'object') continue;
        wrapper.appendChild(kvRow(prop, String(val),
          (newProp, newVal) => {
            if (newProp !== prop) {
              let s = updateMediaStyle(S, S.selection, activeTab, prop, undefined);
              s = updateMediaStyle(s, S.selection, activeTab, newProp, newVal);
              update(s);
            } else {
              update(updateMediaStyle(S, S.selection, activeTab, prop, newVal));
            }
          },
          () => update(updateMediaStyle(S, S.selection, activeTab, prop, undefined)),
          'css-props'
        ));
      }

      const add = document.createElement('span');
      add.className = 'kv-add';
      add.textContent = `+ Add ${activeTab} style`;
      add.onclick = () => update(updateMediaStyle(S, S.selection, activeTab, 'color', '#000'));
      wrapper.appendChild(add);
    }

    return wrapper;
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

  // Media breakpoints section (root only)
  if (S.selection.length === 0) {
    renderInspectorSection(container, 'Media', false, () => {
      const fields = document.createElement('div');
      fields.className = 'inspector-fields';
      const media = node.$media || {};

      for (const [name, query] of Object.entries(media)) {
        fields.appendChild(kvRow(name, query,
          (newName, newQuery) => {
            if (newName !== name) {
              let s = updateMedia(S, name, undefined);
              s = updateMedia(s, newName, newQuery);
              update(s);
            } else {
              update(updateMedia(S, name, newQuery));
            }
          },
          () => update(updateMedia(S, name, undefined))
        ));
      }

      const add = document.createElement('span');
      add.className = 'kv-add';
      add.textContent = '+ Add breakpoint';
      add.onclick = () => update(updateMedia(S, '--bp', '(min-width: 768px)'));
      fields.appendChild(add);
      return fields;
    });
  }

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
function fieldRow(label, type, value, onChange, datalistId) {
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
    if (datalistId) input.setAttribute('list', datalistId);
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
function kvRow(key, value, onChange, onDelete, datalistId) {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const keyInput = document.createElement('input');
  keyInput.className = 'field-input kv-key';
  keyInput.value = key;
  if (datalistId) keyInput.setAttribute('list', datalistId);

  const valInput = document.createElement('input');
  valInput.className = 'field-input kv-val';
  valInput.value = value;
  // Show CSS initial value as placeholder hint
  if (datalistId === 'css-props') {
    valInput.placeholder = cssInitialMap.get(key) || '';
    keyInput.addEventListener('change', () => {
      valInput.placeholder = cssInitialMap.get(keyInput.value) || '';
    });
  }

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
    renderCanvas(); renderOverlays(); renderToolbar();
  }));
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'tb-filename';
  zoomLabel.textContent = `${Math.round(S.ui.zoom * 100)}%`;
  zoomGroup.appendChild(zoomLabel);
  zoomGroup.appendChild(tbBtn('+', () => {
    S = { ...S, ui: { ...S.ui, zoom: Math.min(4, S.ui.zoom + 0.25) } };
    renderCanvas(); renderOverlays(); renderToolbar();
  }));
  toolbar.appendChild(zoomGroup);

  // Feature toggles (non-size media queries like --dark)
  const { featureQueries } = parseMediaEntries(S.document.$media);
  if (featureQueries.length > 0) {
    const toggleGroup = group();
    for (const { name, query } of featureQueries) {
      const btn = document.createElement('button');
      btn.className = `tb-toggle${S.ui.featureToggles[name] ? ' active' : ''}`;
      btn.textContent = name;
      btn.title = query;
      btn.onclick = () => {
        const newToggles = { ...S.ui.featureToggles, [name]: !S.ui.featureToggles[name] };
        S = { ...S, ui: { ...S.ui, featureToggles: newToggles } };
        renderCanvas();
        renderOverlays();
        renderToolbar();
      };
      toggleGroup.appendChild(btn);
    }
    toolbar.appendChild(toggleGroup);
  }

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
