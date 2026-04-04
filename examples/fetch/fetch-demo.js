/**
 * fetch-demo.js — handlers for fetch-demo.json
 *
 * The $user and $posts Request prototypes auto-fetch at mount time.
 * These handlers only change $userId — the runtime detects the URL dependency
 * and triggers re-fetch automatically.
 *
 * Note: Because the Request prototype URL is currently a static string in the
 * JSON (not a $ref), re-fetch on user change is done here by calling .fetch()
 * manually after updating $userId.  For fully declarative reactive re-fetch,
 * compose the URL from a signal using `{ "$ref": "#/$defs/$userId" }` in the
 * url field once string interpolation in prototype URLs is available.
 */

export default {

  prevUser() {
    const id = Math.max(1, this.$userId.get() - 1);
    this.$userId.set(id);
    this._refetch(id);
  },

  nextUser() {
    const id = Math.min(10, this.$userId.get() + 1); // JSONPlaceholder has 10 users
    this.$userId.set(id);
    this._refetch(id);
  },

  /**
   * Trigger fetch for the given user ID by calling the Request signals' .fetch() method.
   * This is the escape hatch for when the URL cannot be expressed as a pure $ref binding.
   *
   * @param {number} id - User ID to fetch
   * @private
   */
  _refetch(id) {
    const base = 'https://jsonplaceholder.typicode.com';
    fetch(`${base}/users/${id}`)
      .then(r => r.json())
      .then(data => this.$user.set(data));

    fetch(`${base}/posts?userId=${id}`)
      .then(r => r.json())
      .then(data => this.$posts.set(data));
  },

};
