/**
 * counter.js — external function examples for counter.json
 *
 * With the new $defs grammar, handlers are defined inline as
 * $prototype: "Function" entries with `body`. This sidecar is
 * kept as documentation of the external $src pattern.
 *
 * `this` is bound to the component scope.
 * Signals are accessed via .get() / .set().
 */

export function increment() {
  this.$count.set(this.$count.get() + 1);
}

export function decrement() {
  this.$count.set(Math.max(0, this.$count.get() - 1));
}

export function reset() {
  this.$count.set(0);
}
