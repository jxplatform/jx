# JSONsx Studio — Metadata-Driven Style Sidebar Specification

**Version:** 0.1.0-draft
**Status:** Proposal
**Depends on:** JSONsx Builder Specification v0.1.0+, JSONsx Studio Next Steps v0.3.0-draft
**License:** MIT

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Design Principles](#3-design-principles)
4. [Metadata Schema](#4-metadata-schema)
5. [Section Definitions](#5-section-definitions)
6. [Input Types](#6-input-types)
7. [Conditional Display](#7-conditional-display)
8. [Shorthand Expansion](#8-shorthand-expansion)
9. [Sidebar Rendering Model](#9-sidebar-rendering-model)
10. [Persistence Model](#10-persistence-model)
11. [State Integration](#11-state-integration)
12. [New File: css-meta.json](#12-new-file-css-metajson)
13. [Changes to studio.js](#13-changes-to-studiojs)
14. [Changes to webdata.json / gen-webdata.js](#14-changes-to-webdatajson--gen-webdatajs)
15. [Novel Code Budget](#15-novel-code-budget)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. Overview

The style sidebar is a persistent, metadata-driven replacement for the current flat key-value list in the Inspector's Style section. It organizes CSS properties into named, collapsible sections (Layout, Spacing, Positioning, Typography, Background, Border, Effects) using a central metadata map that drives section assignment, property ordering, input type, value constraints, and conditional visibility.

"Metadata-driven" means the sidebar has no hardcoded rendering logic per property. Every behavior — which section a property appears in, what input widget it uses, what units are valid, what options a dropdown offers, when a field is shown or hidden — is declared in a data structure. Adding a new property or changing a section assignment requires only a metadata change, not a code change.

"Persistent" means the sections remember their open/closed state across node selections. Switching from one element to another does not reset which sections are expanded. The sidebar always starts with the population of the currently selected node and the last-known collapse state.

---

## 2. Current State

The existing Style section in `studio.js` (`renderInspector`, lines 1834–1926) produces a flat list of key-value rows, one row per property present on the node, rendered in source order. Each row has:

- A text input for the property name, backed by a `<datalist id="css-props">` for autocomplete
- A text input for the value, with `cssInitialMap` used to populate `.placeholder`
- A delete button

**Gaps this spec addresses:**

| Gap | Impact |
|---|---|
| No section grouping | All properties jumbled regardless of concern |
| No property ordering | Properties appear in JSON source order, not logical sequence |
| No specialized inputs | Color values are text; sizes have no unit picker; flex/grid have no selects |
| No conditional display | `top`/`right`/`bottom`/`left` appear even when `position: static` |
| No shorthand expansion | `padding: 8px 16px` is one opaque string; no per-side control |
| Collapse state lost on re-render | Section open/closed resets on every selection change |
| No add-to-section UX | "Add style" is one button; user must know property names and sections |

---

## 3. Design Principles

### 3.1 Metadata is the single source of truth for UI decisions

No rendering code inspects a property name and branches on it directly. Every per-property UI decision is expressed in the metadata map. The renderer is a pure function of: (selected node's style object) × (metadata map) → DOM.

### 3.2 Flat JSON style object → sections are a view

The style sidebar is a view over the flat `node.style` object. It does not restructure the JSON. Properties are grouped into sections visually, but they are stored as a flat camelCase object in the document. The metadata only describes how to display them.

### 3.3 Unknown properties always render

Properties present in the node's style that have no metadata entry are shown in an "Other" section at the bottom. The metadata map defines the preferred display for known properties; unknown properties fall back to the plain `kvRow` behavior. No property is ever silently hidden.

### 3.4 Persistent collapse state is UI state, not document state

Section open/closed state is part of `S.ui`, not `S.document`. It is not persisted to disk. It resets when the browser tab is closed. It is preserved across node selections within a session.

### 3.5 Input type follows the property; value is always a CSS string

Specialized inputs (color pickers, number+unit combos, select dropdowns) produce CSS string values. A color picker writes `#ff6600`; a number+unit combo writes `16px`; a select writes `flex`. The underlying `style` object always contains plain CSS strings — the input type is a rendering concern only.

### 3.6 The metadata file is authoritative; webdata.json is supplementary

`css-meta.json` is the primary source. It is a JSON Schema 2020-12 document whose `$defs` map each CSS property to its UI metadata. `webdata.json` continues to provide the full CSS property + initial value data used for autocomplete and placeholder hints. The two sources complement each other, and `css-meta.json` takes precedence on everything it defines.

---

## 4. Metadata Schema

`css-meta.json` is a JSON Schema 2020-12 document. Its top-level structure is:

```json
{
  "$schema": "../../packages/schema/schema.json",
  "$id": "css-meta",
  "title": "CSS Property Metadata",
  "description": "Metadata for the style sidebar: section assignment, order, input type inference, and conditional display for known CSS properties.",
  "$sections": [
    { "key": "layout",      "label": "Layout"      },
    { "key": "spacing",     "label": "Spacing"     },
    { "key": "positioning", "label": "Positioning" },
    { "key": "typography",  "label": "Typography"  },
    { "key": "background",  "label": "Background"  },
    { "key": "border",      "label": "Border"      },
    { "key": "effects",     "label": "Effects"     },
    { "key": "other",       "label": "Other"       }
  ],
  "$defs": {
    "display": { ... },
    "width":   { ... },
    ...
  }
}
```

**`$sections`** is a custom top-level keyword (consistent with the jsonsx `$`-prefix vocabulary) that declares the ordered section list. The renderer iterates this array to produce sections in canonical order.

**`$defs`** uses the standard JSON Schema vocabulary. Each key is a camelCase CSS property name. Each value is a schema object that declares both the property's data shape (using standard JSON Schema keywords) and its UI metadata (using `$`-prefixed custom keywords). Bun imports JSON natively, so `studio.js` consumes `css-meta.json` directly with `import meta from './css-meta.json'`.

### 4.1 Standard JSON Schema keywords used for UI inference

The input widget type is **inferred** from the schema keywords present on each property entry — there is no explicit `input.type` field. The inference rules are defined in §6.

| Keyword | Purpose in css-meta |
|---|---|
| `"enum": [...]` | Declares exact allowed values → infers `select` input |
| `"format": "color"` | Declares a CSS color value → infers `color` picker |
| `"examples": [...]` | Declares suggested values without constraining → infers `combobox` |
| `"type": "number"` | Declares a unitless numeric value → infers bare number input |
| `"type": "string"` | Default for all CSS string values |
| `"minimum"` / `"maximum"` | Numeric bounds (e.g. `opacity` 0–1) |
| `"default"` | Initial/default value hint used as input placeholder |

### 4.2 Custom `$`-prefixed keywords

These extend the JSON Schema vocabulary for UI concerns that have no standard equivalent. They follow the jsonsx convention of using `$` for custom vocabulary.

| Keyword | Type | Purpose |
|---|---|---|
| `$section` | `string` | Section key: `"layout"`, `"spacing"`, `"positioning"`, `"typography"`, `"background"`, `"border"`, `"effects"`, `"other"` |
| `$order` | `number` | Sort position within section (ascending, lower = higher) |
| `$units` | `string[]` | Valid unit suffixes for number+unit inputs, e.g. `["px","rem","em","%"]`. Presence infers `number-unit` input. |
| `$keywords` | `string[]` | Keyword alternatives for number+unit fields (e.g. `["auto","inherit","min-content"]`). Rendered as a separate select alongside the number+unit pair. |
| `$shorthand` | `string \| true` | If a `string`: names the parent shorthand (longhand link). If `true`: this entry IS a shorthand that expands to its longhands. |
| `$show` | `array` | Conditions: array of `{ "prop": "camelName", "values": ["v1","v2"] }`. Field is hidden when any condition fails. Empty `values` array means "property has any non-empty value." |

---

## 5. Section Definitions

### 5.1 Layout

Controls the box model role, sizing behavior, and flex/grid configuration.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `display` | select | flex/inline-flex/grid options trigger subsections |
| 20 | `width` | number-unit | units: px rem em % vw auto; keywords: auto min-content max-content fit-content |
| 21 | `minWidth` | number-unit | same units/keywords |
| 22 | `maxWidth` | number-unit | same + keywords: none |
| 30 | `height` | number-unit | units: px rem em % vh auto |
| 31 | `minHeight` | number-unit | same |
| 32 | `maxHeight` | number-unit | same + keywords: none |
| 40 | `boxSizing` | select | content-box / border-box |
| 50 | `overflow` | select | visible / hidden / scroll / auto / clip; shown always |
| 51 | `overflowX` | select | same options |
| 52 | `overflowY` | select | same options |
| 60 | `aspectRatio` | combobox | free text; options: auto, 1/1, 4/3, 16/9 |

**Flex subsection** — shown when `display` is `flex` or `inline-flex`:

| order | Property | Input type | Options |
|---|---|---|---|
| 70 | `flexDirection` | select | row / row-reverse / column / column-reverse |
| 71 | `flexWrap` | select | nowrap / wrap / wrap-reverse |
| 72 | `justifyContent` | select | flex-start / flex-end / center / space-between / space-around / space-evenly |
| 73 | `alignItems` | select | stretch / flex-start / flex-end / center / baseline |
| 74 | `alignContent` | select | normal / flex-start / flex-end / center / space-between / space-around / stretch |
| 75 | `gap` | number-unit | units: px rem em % |
| 76 | `rowGap` | number-unit | same |
| 77 | `columnGap` | number-unit | same |
| 80 | `flexGrow` | number-unit | unitless; 0, 1, 2 shortcuts |
| 81 | `flexShrink` | number-unit | unitless |
| 82 | `flexBasis` | number-unit | units: px rem em %; keywords: auto content |
| 83 | `alignSelf` | select | auto / flex-start / flex-end / center / baseline / stretch |
| 84 | `order` | number-unit | unitless integer |

**Grid subsection** — shown when `display` is `grid` or `inline-grid`:

| order | Property | Input type | Notes |
|---|---|---|---|
| 70 | `gridTemplateColumns` | combobox | free text; common options: repeat(2,1fr), repeat(3,1fr), 1fr 1fr, auto 1fr |
| 71 | `gridTemplateRows` | combobox | same style |
| 72 | `gridTemplateAreas` | text | multiline string |
| 73 | `gap` | number-unit | same as flex |
| 74 | `rowGap` | number-unit | — |
| 75 | `columnGap` | number-unit | — |
| 76 | `justifyItems` | select | start / end / center / stretch |
| 77 | `alignItems` | select | same |
| 78 | `justifyContent` | select | same as flex |
| 79 | `alignContent` | select | same |
| 80 | `gridColumn` | text | e.g. 1 / 3 |
| 81 | `gridRow` | text | e.g. 1 / 2 |
| 82 | `justifySelf` | select | same as alignSelf |
| 83 | `alignSelf` | select | same |

### 5.2 Spacing

Padding and margin. Both are shorthand-expandable.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `padding` | shorthand | expands to paddingTop/Right/Bottom/Left |
| 11 | `paddingTop` | number-unit | units: px rem em %; shorthand: padding |
| 12 | `paddingRight` | number-unit | same |
| 13 | `paddingBottom` | number-unit | same |
| 14 | `paddingLeft` | number-unit | same |
| 20 | `margin` | shorthand | expands to marginTop/Right/Bottom/Left |
| 21 | `marginTop` | number-unit | units: px rem em % auto; shorthand: margin |
| 22 | `marginRight` | number-unit | same |
| 23 | `marginBottom` | number-unit | same |
| 24 | `marginLeft` | number-unit | same |

Shorthand rows are the default collapsed view. Each shorthand row has an expand toggle button (⌄) that reveals the four individual side inputs inline without creating a new section.

### 5.3 Positioning

Controls document flow positioning and stacking.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `position` | select | static / relative / absolute / fixed / sticky |
| 20 | `top` | number-unit | units: px rem em %; keywords: auto; **shown only when position ≠ static** |
| 21 | `right` | number-unit | same condition |
| 22 | `bottom` | number-unit | same condition |
| 23 | `left` | number-unit | same condition |
| 30 | `zIndex` | number-unit | unitless integer; keywords: auto |
| 40 | `float` | select | none / left / right / inline-start / inline-end |
| 41 | `clear` | select | none / left / right / both / inline-start / inline-end |

### 5.4 Typography

Text rendering properties.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `fontFamily` | combobox | free text; system font stack options |
| 20 | `fontSize` | number-unit | units: px rem em %; keywords: small medium large x-large |
| 21 | `fontWeight` | combobox | options: 100 200 300 400 500 600 700 800 900 normal bold |
| 22 | `fontStyle` | select | normal / italic / oblique |
| 23 | `fontVariant` | select | normal / small-caps |
| 30 | `lineHeight` | number-unit | unitless + units: px rem em %; keywords: normal |
| 31 | `letterSpacing` | number-unit | units: px rem em; keywords: normal |
| 32 | `wordSpacing` | number-unit | units: px rem em; keywords: normal |
| 40 | `color` | color | color picker + hex/rgb text input |
| 50 | `textAlign` | select | left / right / center / justify / start / end |
| 51 | `textTransform` | select | none / uppercase / lowercase / capitalize |
| 52 | `textDecoration` | combobox | none / underline / overline / line-through; free text for full syntax |
| 53 | `textOverflow` | select | clip / ellipsis |
| 54 | `whiteSpace` | select | normal / nowrap / pre / pre-wrap / pre-line / break-spaces |
| 55 | `wordBreak` | select | normal / break-all / keep-all / break-word |
| 56 | `verticalAlign` | combobox | baseline / top / middle / bottom / text-top / text-bottom; number-unit keywords |
| 60 | `textShadow` | text | free text for full syntax |
| 70 | `listStyleType` | select | none / disc / decimal / circle / square; shown only on li/ul/ol |

### 5.5 Background

Background fills, images, and gradients.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `backgroundColor` | color | color picker + hex/rgba |
| 20 | `backgroundImage` | combobox | free text (for url() / gradients); options: none, linear-gradient(...), radial-gradient(...) |
| 21 | `backgroundSize` | combobox | options: auto / cover / contain; free text for dimensions |
| 22 | `backgroundPosition` | combobox | options: center / top / bottom / left / right + combinations; free text |
| 23 | `backgroundRepeat` | select | repeat / no-repeat / repeat-x / repeat-y / space / round |
| 24 | `backgroundAttachment` | select | scroll / fixed / local |
| 25 | `backgroundClip` | select | border-box / padding-box / content-box / text |
| 26 | `backgroundOrigin` | select | border-box / padding-box / content-box |
| 30 | `background` | text | free text shorthand; shown in "Other" if user typed it directly |
| 40 | `opacity` | number-unit | unitless 0–1; also shows as a 0–100 numeric range display |

### 5.6 Border

Border width, style, color, and radius.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `border` | shorthand | expands to width/style/color |
| 11 | `borderWidth` | shorthand | expands to borderTopWidth etc. |
| 12 | `borderStyle` | select | none / solid / dashed / dotted / double / groove / ridge / inset / outset / hidden |
| 13 | `borderColor` | color | |
| 14 | `borderTopWidth` | number-unit | units: px rem em; shorthand: borderWidth |
| 15 | `borderTopStyle` | select | same as borderStyle |
| 16 | `borderTopColor` | color | |
| 17 | `borderRightWidth` | number-unit | same |
| 18 | `borderRightStyle` | select | same |
| 19 | `borderRightColor` | color | |
| 20 | `borderBottomWidth` | number-unit | same |
| 21 | `borderBottomStyle` | select | same |
| 22 | `borderBottomColor` | color | |
| 23 | `borderLeftWidth` | number-unit | same |
| 24 | `borderLeftStyle` | select | same |
| 25 | `borderLeftColor` | color | |
| 30 | `borderRadius` | shorthand | expands to corners |
| 31 | `borderTopLeftRadius` | number-unit | units: px rem em %; shorthand: borderRadius |
| 32 | `borderTopRightRadius` | number-unit | same |
| 33 | `borderBottomRightRadius` | number-unit | same |
| 34 | `borderBottomLeftRadius` | number-unit | same |
| 40 | `outline` | text | free text |
| 41 | `outlineOffset` | number-unit | units: px rem em |

### 5.7 Effects

Visual filter, shadow, and transform effects.

**Properties (ordered):**

| order | Property | Input type | Notes |
|---|---|---|---|
| 10 | `boxShadow` | text | free text; combobox hints for common patterns |
| 20 | `filter` | combobox | free text; options: none, blur(4px), brightness(1.2), contrast(0.8), grayscale(100%), etc. |
| 21 | `backdropFilter` | combobox | same options as filter |
| 30 | `transform` | combobox | free text; options: none, translateX(0), translateY(0), rotate(0deg), scale(1), skewX(0deg) |
| 31 | `transformOrigin` | combobox | options: center / top / bottom / left / right + combinations |
| 40 | `transition` | combobox | free text; options: none, all 0.2s ease, opacity 0.2s ease |
| 41 | `animationName` | text | |
| 42 | `animationDuration` | number-unit | units: s ms |
| 43 | `animationTimingFunction` | select | ease / linear / ease-in / ease-out / ease-in-out / step-start / step-end |
| 44 | `animationFillMode` | select | none / forwards / backwards / both |
| 45 | `animationIterationCount` | combobox | free text; options: 1, 2, 3, infinite |
| 50 | `cursor` | select | auto / default / pointer / text / move / not-allowed / grab / grabbing / crosshair / help / wait / zoom-in / zoom-out |
| 51 | `pointerEvents` | select | auto / none |
| 52 | `userSelect` | select | auto / none / text / all / contain |
| 53 | `visibility` | select | visible / hidden / collapse |
| 54 | `resize` | select | none / both / horizontal / vertical |
| 55 | `appearance` | select | auto / none |

### 5.8 Other

Rendered last. Contains all properties that either:
- Have no metadata entry at all (unknown or custom properties, including `--custom-property` CSS variables)
- Were explicitly placed in the `'other'` section

"Other" uses the existing plain `kvRow()` behavior: key text input with `css-props` datalist, value text input with initial value placeholder.

---

## 6. Input Types

Input widget type is **inferred** from the JSON Schema keywords present on each property entry in `css-meta.json`. No explicit `type` field — the renderer applies a priority-ordered inference chain.

### 6.1 Inference chain (evaluated in order; first match wins)

| Priority | Condition on the `$defs` entry | Inferred widget |
|---|---|---|
| 1 | `$shorthand: true` | shorthand expander row |
| 2 | `format: "color"` | color picker + hex text |
| 3 | `$units` array is present | number + unit selector |
| 4 | `type: "number"` | bare number input (unitless) |
| 5 | `enum` array is present | select dropdown |
| 6 | `examples` array is present | combobox (free text + datalist) |
| 7 | _(none of the above)_ | plain text input |

### 6.2 `text` (plain)

Fallback for all properties that carry no inference signal. Identical to the current `kvRow` value input. Used for complex shorthand values (e.g. `animation`, `gridTemplateAreas`, `textShadow`).

```json
"gridTemplateAreas": { "$section": "layout", "$order": 72, "type": "string" }
```

### 6.3 `color`

Declared with `"format": "color"`. Renders:

```
[████] #ff6600  ×
```

- `<input type="color">` swatch (left) — native browser color picker
- `<input type="text">` for hex/rgba — editing syncs the swatch
- Bidirectional sync: picker change → text update; valid text input → picker update
- Passes through `transparent`, named colors, `var(--token)` references as plain text without picker sync

```json
"color":           { "$section": "typography", "$order": 40, "type": "string", "format": "color" },
"backgroundColor": { "$section": "background", "$order": 10, "type": "string", "format": "color" }
```

### 6.4 `number-unit`

Declared with a `$units` array. Renders:

```
16  [px ▾]  ×
```

- `<input type="number">` for the numeric part
- `<select>` for the unit, populated from `$units`
- If `$keywords` is defined, a secondary select offers keyword overrides (auto, inherit, etc.) that bypass the number+unit pair and write a bare keyword
- If `$units` is an empty array `[]`, no unit selector is rendered (unitless — for `lineHeight`, `flexGrow`, `zIndex`)

Parsing an existing value: split via `/^(-?[\d.]+)(px|rem|em|%|vw|vh|svh|dvh|ms|s|fr|ch|ex|deg)?$/`. A bare keyword string activates keyword mode.

```json
"fontSize": {
  "$section": "typography", "$order": 20,
  "type": "string",
  "$units": ["px", "rem", "em", "%"],
  "$keywords": ["small", "medium", "large", "x-large", "smaller", "larger"]
},
"flexGrow": {
  "$section": "layout", "$order": 80,
  "type": "string",
  "$units": []
},
"opacity": {
  "$section": "background", "$order": 40,
  "type": "number", "minimum": 0, "maximum": 1
}
```

Note: `opacity` uses `"type": "number"` (priority 4), not `$units` — it renders as a bare number input with no unit selector, and `minimum`/`maximum` constrain the browser `<input type="number">`.

### 6.5 `select`

Declared with `"enum"`. Renders a `<select>` dropdown populated from the enum values. A blank leading option (dash) represents "not set" — selecting it deletes the property. If the current node value is not in the enum, it is appended as an extra option.

```json
"display": {
  "$section": "layout", "$order": 10,
  "type": "string",
  "enum": ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "none", "flow-root"]
},
"position": {
  "$section": "positioning", "$order": 10,
  "type": "string",
  "enum": ["static", "relative", "absolute", "fixed", "sticky"]
}
```

### 6.6 `combobox`

Declared with `"examples"` (without `enum`). Renders `<input type="text">` combined with a `<datalist>` populated from `examples`. Allows arbitrary free-text input while providing quick suggestions. Used when CSS values are common patterns but not exhaustively enumerable.

```json
"fontFamily": {
  "$section": "typography", "$order": 10,
  "type": "string",
  "examples": [
    "system-ui, sans-serif",
    "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    "Georgia, \"Times New Roman\", serif",
    "\"Courier New\", Courier, monospace",
    "inherit"
  ]
},
"transition": {
  "$section": "effects", "$order": 40,
  "type": "string",
  "examples": ["none", "all 0.2s ease", "opacity 0.2s ease", "transform 0.2s ease"]
}
```

### 6.7 `shorthand` expander

Declared with `"$shorthand": true`. Renders a collapsible row:

**Collapsed (default):**

```
padding  [8px 16px           ]  ⌄  ×
```

**Expanded:**

```
padding  [8px 16px           ]  ⌃  ×
  ↳ top     [8   px ▾]
  ↳ right   [16  px ▾]
  ↳ bottom  [8   px ▾]
  ↳ left    [16  px ▾]
```

- The shorthand value input is free-form text
- `⌄` / `⌃` toggle expands/collapses the per-side longhand inputs
- Editing a longhand input writes that longhand property to `node.style` and removes the corresponding portion from the shorthand string
- Editing the shorthand text input clears all linked longhand properties and writes the shorthand

Longhands are linked to their parent via `"$shorthand": "padding"` (a string naming the parent). The expansion state per shorthand is persisted in `S.ui.styleShorthands` (§10).

When individual longhands exist but no shorthand is present, the shorthand row shows a computed synthetic placeholder (e.g. `8px 0px 16px 0px`) and the expansion state is forced open.

```json
"padding":    { "$section": "spacing", "$order": 10, "type": "string", "$shorthand": true },
"paddingTop": { "$section": "spacing", "$order": 11, "type": "string", "$units": ["px","rem","em","%"], "$shorthand": "padding" }
```

### 6.8 `toggle`

Not declared by a JSON Schema keyword — selected explicitly via a `$toggle: true` annotation (available for future use). Renders a segmented button row cycling through a small set of values. Clicking the active value deletes the property. Reserved for cases where a `select` would have ≤ 3 very-short options and a button row is more scannable than a dropdown.

---

## 7. Conditional Display

### 7.1 Condition model

A property entry with a `$show` array is only rendered in the sidebar if every condition in the array passes against the current node's style object. Conditions are checked against the resolved effective style: if a base value is absent but a media override is active, the override value is used.

```js
// Condition evaluation (studio.js)
function conditionPasses(cond, styles) {
  const val = styles[cond.prop] ?? ''
  if (cond.values.length === 0) return val !== '' && val !== 'initial'
  return cond.values.includes(val)
}

function allConditionsPass(entry, styles) {
  return (entry.$show ?? []).every(c => conditionPasses(c, styles))
}
```

### 7.2 Defined conditions

**Positioning fields — `top`, `right`, `bottom`, `left`, `zIndex`:**

```json
"$show": [{ "prop": "position", "values": ["relative", "absolute", "fixed", "sticky"] }]
```

When `position` is absent or `static`, these five fields are hidden from the Positioning section. They remain discoverable through the Other section if they are already set on the node despite the condition failing.

**Flex fields — `flexDirection` through `alignSelf`:**

```json
"$show": [{ "prop": "display", "values": ["flex", "inline-flex"] }]
```

**Grid fields — `gridTemplateColumns` through `alignSelf` (grid variant):**

```json
"$show": [{ "prop": "display", "values": ["grid", "inline-grid"] }]
```

**`textOverflow` — only meaningful when `overflow` is not `visible`:**

```json
"$show": [{ "prop": "overflow", "values": ["hidden", "clip", "auto", "scroll"] }]
```

**`animationDuration`, `animationTimingFunction`, `animationFillMode`, `animationIterationCount`:**

```json
"$show": [{ "prop": "animationName", "values": [] }]
```

### 7.3 Hidden fields with existing values

If a conditional field is hidden because its condition fails, but that field already has a value in the node's style, it MUST still be displayed, with a visual indicator (⚠ muted yellow) that the property exists but its condition is not currently met. This prevents data loss: a user cannot unsee a property just because they changed another value.

---

## 8. Shorthand Expansion

### 8.1 The expansion registry

The metadata uses two complementary `$shorthand` forms to link shorthands to their longhands:

- **Shorthand entry**: `"$shorthand": true`. This property renders the collapsible expander row.
- **Longhand entry**: `"$shorthand": "propertyName"` (a string). This links the longhand to its parent shorthand. Longhands are only rendered inside the expanded shorthand — never as independent rows unless they are present in the node's style without their shorthand.

### 8.2 Expansion rules

1. If the shorthand property is present on the node: display the shorthand row (collapsed or expanded per UI state). Expanded state shows all four longhands.

2. If no shorthand is present but one or more longhands are present: the shorthand row renders with a synthetic placeholder showing the computed shorthand notation, and expansion state is forced open (longhands are always revealed when set individually).

3. If neither the shorthand nor any longhands are present: only the shorthand add row is shown (see §9.3 on Add controls).

4. If both the shorthand and some longhands are present (a mixed state): the shorthand value is shown, and the longhands present are shown in the expanded view. The user must resolve the conflict themselves — the sidebar displays both without attempting automatic resolution.

### 8.3 Shorthand pairs defined

| Shorthand | Longhands |
|---|---|
| `padding` | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` |
| `margin` | `marginTop`, `marginRight`, `marginBottom`, `marginLeft` |
| `borderWidth` | `borderTopWidth`, `borderRightWidth`, `borderBottomWidth`, `borderLeftWidth` |
| `borderStyle` | `borderTopStyle`, `borderRightStyle`, `borderBottomStyle`, `borderLeftStyle` |
| `borderColor` | `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor` |
| `borderRadius` | `borderTopLeftRadius`, `borderTopRightRadius`, `borderBottomRightRadius`, `borderBottomLeftRadius` |
| `border` | shows `borderWidth`, `borderStyle`, `borderColor` as its three children (recursive: each is itself a shorthand) |

---

## 9. Sidebar Rendering Model

### 9.1 Structure

The style sidebar replaces the current `wrapper` div in the Style inspector section. Its structure is:

```
<div class="style-sidebar">
  <div class="style-media-tabs">...</div>           ← existing media tabs (unchanged)

  <div class="style-section" data-key="layout">
    <div class="style-section-header">
      <span class="style-section-collapse">▼</span>
      <span class="style-section-label">Layout</span>
      <button class="style-section-add">+</button>
    </div>
    <div class="style-section-body">
      <!-- rows for properties active in this section -->
    </div>
  </div>

  <!-- ... one .style-section per STYLE_SECTIONS entry -->
</div>
```

All sections are always rendered. Empty sections (no active or conditionally-visible properties) show only the header row. The "Other" section is only rendered if there are properties that belong to it.

### 9.2 Property rows

Each property in a section renders as one of the input type views from §6. All input types share a common outer wrapper:

```html
<div class="style-row" data-prop="fontSize">
  <span class="style-row-label">fontSize</span>
  <!-- input widget (type-specific) -->
  <button class="style-row-delete">×</button>
</div>
```

The label is the camelCase property name. In a future iteration, a display name map (e.g. `fontSize` → `Font Size`) can be layered on, but camelCase is used in v1 to stay aligned with the developer-first principle and the JSON source vocabulary.

Rows for shorthand longhands rendered in expanded state have an additional `style-row--child` class and a left indent (16px).

### 9.3 Add controls

Each section header has a `+` button that opens a floating input/select for adding a new property to that section:

- A text input with a context-specific `<datalist>` listing the known properties for that section (properties from `meta.$defs` whose `$section` matches the current section key)
- Typing filters the list; pressing Enter or clicking a suggestion adds the property with its `cssInitialMap` value as placeholder
- Properties already present on the node are shown with a checkmark in the suggestions, not disabled (re-adding is allowed)

The global "Add style" button from the current implementation is removed. The per-section `+` buttons replace it.

### 9.4 Section visibility

Sections that have no properties set on the current node AND have no conditional fields about to be revealed are shown collapsed with an empty-state message only when the section is manually opened by the user. This prevents visual noise when selecting a node that has no styles yet.

The rule:

- If a section has at least one property present on the node → render it open (per last-used collapse state)
- If a section has zero properties but `S.ui.styleSections[sectionKey]` is explicitly `true` → render open with empty state and the `+` add button
- If a section has zero properties AND no explicit open state → render collapsed (header only)

---

## 10. Persistence Model

### 10.1 `S.ui.styleSections`

A plain object mapping section keys to booleans:

```js
S.ui.styleSections = {
  layout:      true,   // open
  spacing:     true,   // open
  positioning: false,  // collapsed
  typography:  true,   // open
  background:  false,
  border:      false,
  effects:     false,
  other:       false,
}
```

Default initial state (applied when the studio loads with no prior session): all sections collapsed. Sections auto-open when a node is selected that has properties in that section.

Updated on every section collapse/expand click via a shallow `S.ui` merge — no document mutation, no undo history entry.

### 10.2 `S.ui.styleShorthands`

A plain object mapping shorthand property names to booleans (expanded = true):

```js
S.ui.styleShorthands = {
  padding:     true,   // expanded (individual sides visible)
  margin:      false,  // collapsed
  borderRadius: false,
  // ... only entries for shorthands the user has explicitly toggled
}
```

Updated on shorthand expand/collapse click.

### 10.3 Selection change behavior

When `S.selection` changes, the sidebar:

1. Keeps `S.ui.styleSections` and `S.ui.styleShorthands` completely unchanged (this is the "persistent" guarantee)
2. Re-evaluates which sections have active properties on the new node
3. For sections that were collapsed AND the new node has properties in them, the section is opened automatically (because the user needs to see the properties)
4. For sections that were open but the new node has no properties in them, the section stays open (the user opened it intentionally and may want to add properties)

---

## 11. State Integration

### 11.1 State model changes

`state.js` requires the following additions to the initial state factory:

```js
// In makeInitialState() or wherever S.ui is initialized:
ui: {
  // ... existing fields (leftTab, rightTab, zoom, activeMedia, featureToggles)

  // NEW: style sidebar persistence
  styleSections: {
    layout:      false,
    spacing:     false,
    positioning: false,
    typography:  false,
    background:  false,
    border:      false,
    effects:     false,
    other:       false,
  },
  styleShorthands: {},
}
```

These fields are not written to disk. They are initialized fresh on each page load.

### 11.2 Mutation functions

No new mutation functions are needed for the sidebar UI state — it uses direct `S.ui` shallow merges (the same pattern used by `activeMedia` today).

The existing `updateStyle()` and `updateMediaStyle()` mutations in `state.js` are unchanged — the sidebar writes through them exactly as the current `kvRow` system does.

### 11.3 Style section auto-open logic

Implemented in `renderStyleSidebar()` (new function in `studio.js`, called from within the existing Style inspector section):

```js
function autoOpenSections(node, currentSections) {
  const style = node.style || {}
  const result = { ...currentSections }
  for (const prop of Object.keys(style)) {
    if (typeof style[prop] === 'object') continue  // skip @media keys
    const entry = meta.$defs[prop]
    const section = entry?.$section ?? 'other'
    if (!result[section]) result[section] = true
  }
  return result
}
```

Called at the top of `renderStyleSidebar()`. If the returned result differs from `S.ui.styleSections`, `S.ui.styleSections` is updated before rendering (no undo entry).

---

## 12. New File: css-meta.json

Location: `packages/studio/css-meta.json`

A JSON Schema 2020-12 document. No JS module machinery — the studio imports it directly via Bun's native JSON import. No runtime processing beyond `import meta from './css-meta.json'`.

### 12.1 Scope

`$defs` covers all CSS properties referenced in §5 (~120 named properties). The `other` section handles the full long-tail of known and unknown CSS properties. Custom properties (`--*`) are never in `$defs` and always fall through to Other.

### 12.2 Full document skeleton

```json
{
  "$schema": "../../packages/schema/schema.json",
  "$id": "css-meta",
  "title": "CSS Property Metadata",
  "description": "Section assignment, order, and input inference metadata for the style sidebar.",
  "$sections": [
    { "key": "layout",      "label": "Layout"      },
    { "key": "spacing",     "label": "Spacing"     },
    { "key": "positioning", "label": "Positioning" },
    { "key": "typography",  "label": "Typography"  },
    { "key": "background",  "label": "Background"  },
    { "key": "border",      "label": "Border"      },
    { "key": "effects",     "label": "Effects"     },
    { "key": "other",       "label": "Other"       }
  ],
  "$defs": {

    "display": {
      "$section": "layout", "$order": 10,
      "type": "string",
      "enum": ["block","inline","inline-block","flex","inline-flex","grid","inline-grid","contents","none","flow-root","table","list-item"]
    },

    "width": {
      "$section": "layout", "$order": 20,
      "type": "string",
      "$units": ["px","rem","em","%","vw","svw"],
      "$keywords": ["auto","min-content","max-content","fit-content"]
    },

    "boxSizing": {
      "$section": "layout", "$order": 40,
      "type": "string",
      "enum": ["content-box","border-box"]
    },

    "aspectRatio": {
      "$section": "layout", "$order": 60,
      "type": "string",
      "examples": ["auto","1/1","4/3","16/9","2/1"]
    },

    "flexDirection": {
      "$section": "layout", "$order": 70,
      "type": "string",
      "enum": ["row","row-reverse","column","column-reverse"],
      "$show": [{ "prop": "display", "values": ["flex","inline-flex"] }]
    },

    "justifyContent": {
      "$section": "layout", "$order": 72,
      "type": "string",
      "enum": ["flex-start","flex-end","center","space-between","space-around","space-evenly","start","end","normal"],
      "$show": [{ "prop": "display", "values": ["flex","inline-flex","grid","inline-grid"] }]
    },

    "gap": {
      "$section": "layout", "$order": 75,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$show": [{ "prop": "display", "values": ["flex","inline-flex","grid","inline-grid"] }]
    },

    "flexGrow": {
      "$section": "layout", "$order": 80,
      "type": "string",
      "$units": [],
      "$show": [{ "prop": "display", "values": ["flex","inline-flex"] }]
    },

    "flexBasis": {
      "$section": "layout", "$order": 82,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$keywords": ["auto","content"],
      "$show": [{ "prop": "display", "values": ["flex","inline-flex"] }]
    },

    "gridTemplateColumns": {
      "$section": "layout", "$order": 70,
      "type": "string",
      "examples": ["repeat(2,1fr)","repeat(3,1fr)","repeat(4,1fr)","1fr 1fr","auto 1fr","auto"],
      "$show": [{ "prop": "display", "values": ["grid","inline-grid"] }]
    },

    "padding": {
      "$section": "spacing", "$order": 10,
      "type": "string",
      "$shorthand": true
    },

    "paddingTop": {
      "$section": "spacing", "$order": 11,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "padding"
    },

    "paddingRight": {
      "$section": "spacing", "$order": 12,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "padding"
    },

    "paddingBottom": {
      "$section": "spacing", "$order": 13,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "padding"
    },

    "paddingLeft": {
      "$section": "spacing", "$order": 14,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "padding"
    },

    "margin": {
      "$section": "spacing", "$order": 20,
      "type": "string",
      "$shorthand": true
    },

    "marginTop": {
      "$section": "spacing", "$order": 21,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$keywords": ["auto"],
      "$shorthand": "margin"
    },

    "position": {
      "$section": "positioning", "$order": 10,
      "type": "string",
      "enum": ["static","relative","absolute","fixed","sticky"]
    },

    "top": {
      "$section": "positioning", "$order": 20,
      "type": "string",
      "$units": ["px","rem","em","%","vw","vh"],
      "$keywords": ["auto"],
      "$show": [{ "prop": "position", "values": ["relative","absolute","fixed","sticky"] }]
    },

    "zIndex": {
      "$section": "positioning", "$order": 30,
      "type": "string",
      "$units": [],
      "$keywords": ["auto"],
      "$show": [{ "prop": "position", "values": ["relative","absolute","fixed","sticky"] }]
    },

    "float": {
      "$section": "positioning", "$order": 40,
      "type": "string",
      "enum": ["none","left","right","inline-start","inline-end"]
    },

    "fontFamily": {
      "$section": "typography", "$order": 10,
      "type": "string",
      "examples": [
        "system-ui, sans-serif",
        "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
        "Georgia, \"Times New Roman\", serif",
        "\"Courier New\", Courier, monospace",
        "inherit"
      ]
    },

    "fontSize": {
      "$section": "typography", "$order": 20,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$keywords": ["small","medium","large","x-large","xx-large","smaller","larger"]
    },

    "fontWeight": {
      "$section": "typography", "$order": 21,
      "type": "string",
      "examples": ["100","200","300","400","500","600","700","800","900","normal","bold","lighter","bolder"]
    },

    "fontStyle": {
      "$section": "typography", "$order": 22,
      "type": "string",
      "enum": ["normal","italic","oblique"]
    },

    "lineHeight": {
      "$section": "typography", "$order": 30,
      "type": "string",
      "$units": ["px","rem","em"],
      "$keywords": ["normal"]
    },

    "color": {
      "$section": "typography", "$order": 40,
      "type": "string",
      "format": "color"
    },

    "textAlign": {
      "$section": "typography", "$order": 50,
      "type": "string",
      "enum": ["left","right","center","justify","start","end"]
    },

    "textTransform": {
      "$section": "typography", "$order": 51,
      "type": "string",
      "enum": ["none","uppercase","lowercase","capitalize"]
    },

    "textOverflow": {
      "$section": "typography", "$order": 53,
      "type": "string",
      "enum": ["clip","ellipsis"],
      "$show": [{ "prop": "overflow", "values": ["hidden","clip","auto","scroll"] }]
    },

    "backgroundColor": {
      "$section": "background", "$order": 10,
      "type": "string",
      "format": "color"
    },

    "backgroundImage": {
      "$section": "background", "$order": 20,
      "type": "string",
      "examples": ["none","linear-gradient(to bottom, #fff, #000)","radial-gradient(circle, #fff, #000)"]
    },

    "backgroundSize": {
      "$section": "background", "$order": 21,
      "type": "string",
      "examples": ["auto","cover","contain","100% 100%"]
    },

    "backgroundRepeat": {
      "$section": "background", "$order": 23,
      "type": "string",
      "enum": ["repeat","no-repeat","repeat-x","repeat-y","space","round"]
    },

    "opacity": {
      "$section": "background", "$order": 40,
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },

    "borderRadius": {
      "$section": "border", "$order": 30,
      "type": "string",
      "$shorthand": true
    },

    "borderTopLeftRadius": {
      "$section": "border", "$order": 31,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "borderRadius"
    },

    "borderTopRightRadius": {
      "$section": "border", "$order": 32,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "borderRadius"
    },

    "borderBottomRightRadius": {
      "$section": "border", "$order": 33,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "borderRadius"
    },

    "borderBottomLeftRadius": {
      "$section": "border", "$order": 34,
      "type": "string",
      "$units": ["px","rem","em","%"],
      "$shorthand": "borderRadius"
    },

    "borderColor": {
      "$section": "border", "$order": 13,
      "type": "string",
      "format": "color"
    },

    "borderStyle": {
      "$section": "border", "$order": 12,
      "type": "string",
      "enum": ["none","solid","dashed","dotted","double","groove","ridge","inset","outset","hidden"]
    },

    "borderWidth": {
      "$section": "border", "$order": 11,
      "type": "string",
      "$shorthand": true
    },

    "borderTopWidth": {
      "$section": "border", "$order": 14,
      "type": "string",
      "$units": ["px","rem","em"],
      "$shorthand": "borderWidth"
    },

    "outline": {
      "$section": "border", "$order": 40,
      "type": "string"
    },

    "boxShadow": {
      "$section": "effects", "$order": 10,
      "type": "string",
      "examples": ["none","0 1px 3px rgba(0,0,0,0.12)","0 4px 6px rgba(0,0,0,0.1)","inset 0 1px 2px rgba(0,0,0,0.1)"]
    },

    "filter": {
      "$section": "effects", "$order": 20,
      "type": "string",
      "examples": ["none","blur(4px)","brightness(1.2)","contrast(0.8)","grayscale(100%)","saturate(1.5)"]
    },

    "transform": {
      "$section": "effects", "$order": 30,
      "type": "string",
      "examples": ["none","translateX(0)","translateY(0)","rotate(0deg)","scale(1)","skewX(0deg)"]
    },

    "transition": {
      "$section": "effects", "$order": 40,
      "type": "string",
      "examples": ["none","all 0.2s ease","opacity 0.2s ease","transform 0.2s ease","background-color 0.2s ease"]
    },

    "animationName": {
      "$section": "effects", "$order": 41,
      "type": "string"
    },

    "animationDuration": {
      "$section": "effects", "$order": 42,
      "type": "string",
      "$units": ["s","ms"],
      "$show": [{ "prop": "animationName", "values": [] }]
    },

    "animationTimingFunction": {
      "$section": "effects", "$order": 43,
      "type": "string",
      "enum": ["ease","linear","ease-in","ease-out","ease-in-out","step-start","step-end"],
      "$show": [{ "prop": "animationName", "values": [] }]
    },

    "cursor": {
      "$section": "effects", "$order": 50,
      "type": "string",
      "enum": ["auto","default","pointer","text","move","not-allowed","grab","grabbing","crosshair","help","wait","zoom-in","zoom-out","none"]
    },

    "pointerEvents": {
      "$section": "effects", "$order": 51,
      "type": "string",
      "enum": ["auto","none"]
    },

    "visibility": {
      "$section": "effects", "$order": 53,
      "type": "string",
      "enum": ["visible","hidden","collapse"]
    }

  }
}
```

### 12.3 Meta-schema

A companion `css-meta-schema.json` formally describes the structure of each `$defs` entry. It validates that every property entry has the required `$section` and `$order`, and that `$show` entries are well-formed. This schema is used during development (e.g. a `bun run validate` script) to catch authoring mistakes in `css-meta.json`.

```json
{
  "$schema": "../../packages/schema/schema.json",
  "$id": "css-meta-schema",
  "title": "CSS Property Metadata Entry Schema",
  "type": "object",
  "required": ["$section", "$order"],
  "properties": {
    "$section": {
      "type": "string",
      "enum": ["layout","spacing","positioning","typography","background","border","effects","other"]
    },
    "$order":    { "type": "number" },
    "$units":    { "type": "array",  "items": { "type": "string" } },
    "$keywords": { "type": "array",  "items": { "type": "string" } },
    "$shorthand": { "oneOf": [{ "type": "string" }, { "type": "boolean", "const": true }] },
    "$show": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["prop", "values"],
        "properties": {
          "prop":   { "type": "string" },
          "values": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

### 12.4 Size

~120–130 property entries at 4–8 lines each. Total file: ~700–900 lines of JSON.

---

## 13. Changes to studio.js

### 13.1 New function: `renderStyleSidebar(wrapper, node, activeTab)`

Replaces the body of the current Style section content function. Takes the container div, the selected node, and the active media tab name (or null for base).

Responsibilities:
1. Call `autoOpenSections()` and apply result to `S.ui.styleSections` if changed
2. Partition style properties across sections using `CSS_META`
3. For each section in `STYLE_SECTIONS`:
   - Create section header with collapse toggle and `+` button
   - Evaluate conditions using `allConditionsPass()` for each property in the section
   - Render rows for: (a) properties present on the node, (b) conditional properties whose condition is met
   - If a conditional property is hidden but has a value, render it with the ⚠ indicator
4. Render "Other" section last for uncategorized properties

### 13.2 New function: `inferInputType(entry)`

Derives the input widget type from a `$defs` entry using the inference chain from §6.1. Returns one of: `'shorthand'`, `'color'`, `'number-unit'`, `'number'`, `'select'`, `'combobox'`, `'text'`.

```js
function inferInputType(entry) {
  if (entry.$shorthand === true)         return 'shorthand'
  if (entry.format === 'color')          return 'color'
  if (entry.$units !== undefined)        return 'number-unit'
  if (entry.type === 'number')           return 'number'
  if (Array.isArray(entry.enum))         return 'select'
  if (Array.isArray(entry.examples))     return 'combobox'
  return 'text'
}
```

### 13.3 New function: `renderStyleRow(entry, prop, value, onCommit, onDelete)`

Dispatches to the correct input widget by calling `inferInputType(entry)`. Returns a `.style-row` div.

### 13.4 New function: `renderColorInput(value, onChange)`

Color picker + text input pair. Returns a div. Handles sync between the `<input type="color">` and the text field.

### 13.5 New function: `renderNumberUnitInput(entry, value, onChange)`

Number input + unit selector. Returns a div. Populates unit options from `entry.$units`, keyword options from `entry.$keywords`. Handles parsing of existing value string and keyword mode.

### 13.6 New function: `renderShorthandRow(entry, prop, style, onChange, onDelete, isExpanded, onToggleExpand)`

Renders the shorthand header row and optionally the expanded longhand rows. Finds longhands by scanning `meta.$defs` for entries where `$shorthand === prop`. Returns a DocumentFragment.

### 13.7 Import addition

```js
import meta from './css-meta.json'
// meta.$sections  → ordered section list
// meta.$defs      → property name → entry object
```

### 13.8 State initialization

In the state initialization path (wherever `S.ui` is set to its defaults), add:

```js
styleSections: Object.fromEntries(meta.$sections.map(s => [s.key, false])),
styleShorthands: {},
```

### 13.8 CSS additions to index.html

New CSS classes required in `<style>`:

```
.style-sidebar
.style-section
.style-section-header
.style-section-collapse
.style-section-label
.style-section-add
.style-section-body
.style-row
.style-row--child
.style-row-label
.style-row-delete
.style-row--warning       ← conditional field present but condition failing
.style-input-color        ← color swatch + text combo
.style-input-number-unit  ← number input + unit select combo
.style-input-keywords     ← keyword select for number-unit fields
```

---

## 14. Changes to webdata.json / gen-webdata.js

No changes required. `webdata.json` continues to provide the full `cssProps` array for the Other section's `kvRow` datalist and for placeholder hints in all input types via `cssInitialMap`.

`gen-webdata.js` is not a dependency of `css-meta.json`. The metadata is authored manually against the JSON Schema vocabulary. `css-meta-schema.json` (§12.3) can be used in a `bun run validate` script to catch authoring mistakes, but this is optional tooling, not a required build step.

---

## 15. Novel Code Budget

| Module / Change | Est. lines | Notes |
|---|---|---|
| `css-meta.json` — full `$defs` + `$sections` | ~800 | ~120 entries at avg 6 lines; JSON is more verbose than JS |
| `css-meta-schema.json` — meta-schema for authoring validation | ~40 | Optional but recommended |
| `renderStyleSidebar()` — top-level section loop | ~80 | Section iteration, auto-open, section header DOM |
| `inferInputType()` — inference chain | ~15 | Pure function; 7-branch priority chain |
| `renderStyleRow()` — input type dispatcher | ~30 | Calls `inferInputType`, delegates to sub-renderers |
| `renderColorInput()` — swatch + text sync | ~60 | Bidirectional sync |
| `renderNumberUnitInput()` — number + unit | ~80 | Parse value, unit select, `$keywords` select |
| `renderShorthandRow()` — expand/collapse | ~90 | Row + toggle, optional child rows, synthetic placeholder |
| `allConditionsPass()` + `conditionPasses()` | ~20 | Pure condition evaluation against `$show` |
| `autoOpenSections()` — selection-change auto-open | ~20 | Uses `meta.$defs[prop].$section` |
| Section `+` add control with filtered datalist | ~40 | Section-scoped options from `meta.$defs` |
| `S.ui` state additions + initialization | ~15 | Two new keys; `meta.$sections` drives defaults |
| CSS in `index.html` — new class rules | ~80 | Sidebar layout, row styles, color/number-unit inputs |
| **Total** | **~1,370** | |

The JSON file accounts for the increase vs. the JS version — identical property coverage, but JSON is more verbose than a JS Map literal. All logic is unchanged.

This is an additive spec — no existing code is deleted. The current `kvRow`-based Style section body is replaced by `renderStyleSidebar()`. All existing mutations (`updateStyle`, `updateMediaStyle`) are reused unchanged.

---

## 16. Implementation Phases

### Phase A — Metadata and section skeleton (~2 days)

Goals:
- Author `css-meta.json` with all property entries and `css-meta-schema.json`
- Implement section rendering loop with collapse/expand and persistence
- Auto-open logic on selection change
- Per-section `+` add control

Exit criterion: The Style section in the inspector shows named, collapsible section headers instead of a flat list. All existing properties appear in the correct sections. Properties not in `meta.$defs` appear in "Other". The add button per section works.

### Phase B — Specialized inputs (~2 days)

Goals:
- `renderColorInput()` — color swatch sync
- `renderNumberUnitInput()` — number + unit select + keyword mode
- `renderStyleRow()` dispatcher
- select and combobox inputs

Exit criterion: `color`, `backgroundColor`, `fontSize`, `padding` (text mode), `display` (dropdown), `position` (dropdown) all render with their specialized inputs. Editing any of them commits the correct string value to the style object.

### Phase C — Shorthand expansion (~2 days)

Goals:
- `renderShorthandRow()` with expand/collapse toggle
- `S.ui.styleShorthands` persistence
- Synthetic placeholder for longhand-only state

Exit criterion: `padding` renders as a single collapsible row. Expanding it shows four individual inputs. Editing a side input writes the longhand and removes it from the shorthand. Collapse state persists across node selections.

### Phase D — Conditional display (~1 day)

Goals:
- `allConditionsPass()` evaluation wired into section rendering
- Flex/Grid subsections appear when display is flex/grid
- `top`/`right`/`bottom`/`left`/`z-index` hidden when position is static
- ⚠ indicator for hidden fields with active values

Exit criterion: Switching `display` from `block` to `flex` immediately reveals the flex subsection. Setting `position: absolute` reveals the offset fields. Removing `position` collapses them again. A node with `top: 10px` and no position property shows the `top` field with a warning indicator.

---

*JSONsx Studio — Style Sidebar Specification v0.1.0-draft — subject to revision*
