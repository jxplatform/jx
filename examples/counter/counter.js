/**
 * counter.js — handlers for counter.json
 *
 * `this` is bound to the component scope.
 * Signals are accessed via .get() / .set() — explicit by design,
 * following the TC39 Signals proposal API.
 */

export default {

  /**
   * Increase the counter by 1.
   */
  increment() {
    this.$count.set(this.$count.get() + 1);
  },

  /**
   * Decrease the counter by 1 (minimum 0).
   */
  decrement() {
    this.$count.set(Math.max(0, this.$count.get() - 1));
  },

  /**
   * Reset the counter to zero.
   */
  reset() {
    this.$count.set(0);
  },

};
