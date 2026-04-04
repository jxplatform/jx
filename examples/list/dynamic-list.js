/**
 * dynamic-list.js — handlers for dynamic-list.json
 *
 * $items is a LocalStorage signal — .set() automatically persists to localStorage.
 * $itemCount is a JSONata computed signal — no handler needed.
 *
 * The remove handler reads the current item index from the $map/index context
 * injected by the Array namespace renderer.
 */

export default {

  /**
   * Add the current $newText value to $items, then clear the input.
   * No-ops if the input is empty or whitespace-only.
   */
  addItem() {
    const text = this.$newText.get().trim();
    if (!text) return;
    this.$items.set([...this.$items.get(), text]);
    this.$newText.set('');
  },

  /**
   * Remove the item at the given index.
   * The Array namespace passes the event object as the first argument;
   * the index is read from the $itemIndex signal on `this` (the map scope).
   *
   * @param {Event} event - Native DOM click event
   */
  removeItem(event) {
    // `this` in a map item scope has access to $itemIndex signal
    const index = this.$itemIndex?.get?.() ?? -1;
    if (index < 0) return;
    const current = this.$items.get();
    this.$items.set(current.filter((_, i) => i !== index));
  },

  /**
   * Keep $newText in sync with the input element value.
   *
   * @param {InputEvent} event - oninput event from the text field
   */
  updateText(event) {
    this.$newText.set(event.target.value);
  },

};
