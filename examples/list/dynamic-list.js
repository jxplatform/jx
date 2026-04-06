/**
 * dynamic-list.js — external functions for dynamic-list.json
 *
 * With the new $defs grammar, handlers are defined inline as
 * $prototype: "Function" entries with `body`. This sidecar is
 * kept as documentation of the external $src pattern.
 */

export function addItem() {
  const text = this.$newText.get().trim();
  if (!text) return;
  this.$items.set([...this.$items.get(), text]);
  this.$newText.set('');
}

export function removeItem(event) {
  const index = this.$map?.index ?? -1;
  if (index < 0) return;
  const current = this.$items.get();
  this.$items.set(current.filter((_, i) => i !== index));
}

export function updateText(event) {
  this.$newText.set(event.target.value);
}
