/**
 * router.js — handlers for router.json
 *
 * A minimal client-side router driven by a single signal.
 * The navigate handler reads data-route from the clicked button
 * and sets $currentRoute, which drives the $switch renderer.
 */

export default {

  /**
   * Read the data-route attribute from the clicked nav button and navigate.
   *
   * @param {MouseEvent} event - Click event from a nav button
   */
  navigate(event) {
    const route = event.currentTarget?.dataset?.route
      ?? event.target?.dataset?.route;
    if (route) this.$currentRoute.set(route);
  },

};
