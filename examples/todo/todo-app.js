/**
 * todo-app.js — external functions for todo-app.json
 *
 * With the new $defs grammar, handlers are defined inline as
 * $prototype: "Function" entries with `body`. This sidecar is
 * kept as documentation of the external $src pattern.
 */

export function addItem(event) {
  if (event.key !== 'Enter') return;
  const text = event.target.value.trim();
  if (!text) return;
  this.$items.set([
    ...this.$items.get(),
    { id: Date.now(), text, done: false },
  ]);
  event.target.value = '';
}

export function toggleItem(_event) {
  const index = this.$map?.index ?? -1;
  if (index < 0) return;
  this.$items.set(
    this.$items.get().map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  );
}

export function clearDone() {
  this.$items.set(this.$items.get().filter(item => !item.done));
}
