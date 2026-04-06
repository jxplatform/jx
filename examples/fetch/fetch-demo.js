/**
 * fetch-demo.js — external functions for fetch-demo.json
 *
 * The $user and $posts Request prototypes auto-fetch at mount time.
 * These handlers change $userId and manually re-fetch since the URL
 * is not yet composed from a signal reference.
 */

export function prevUser() {
  const id = Math.max(1, this.$userId.get() - 1);
  this.$userId.set(id);
  _refetch.call(this, id);
}

export function nextUser() {
  const id = Math.min(10, this.$userId.get() + 1);
  this.$userId.set(id);
  _refetch.call(this, id);
}

function _refetch(id) {
  const base = 'https://jsonplaceholder.typicode.com';
  fetch(`${base}/users/${id}`)
    .then(r => r.json())
    .then(data => this.$user.set(data));

  fetch(`${base}/posts?userId=${id}`)
    .then(r => r.json())
    .then(data => this.$posts.set(data));
}
