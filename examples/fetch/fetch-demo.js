/**
 * fetch-demo.js — computed functions for the live search demo.
 *
 * Complex computeds live here; simple handlers and one-liners
 * are declared inline with `body` in fetch-demo.json.
 */

export function filteredPosts($defs) {
  const posts = $defs.allPosts;
  if (!Array.isArray(posts)) return [];
  const term = ($defs.searchTerm || '').toLowerCase().trim();
  const uid  = String($defs.selectedUserId || '');
  return posts.filter(p =>
    (!term || p.title.toLowerCase().includes(term) || p.body.toLowerCase().includes(term)) &&
    (!uid  || String(p.userId) === uid)
  );
}

export function paginatedPosts($defs) {
  const filtered = $defs.filteredPosts;
  if (!Array.isArray(filtered)) return [];
  const start = ($defs.currentPage - 1) * $defs.perPage;
  return filtered.slice(start, start + $defs.perPage);
}

export function statsText($defs) {
  if (!$defs.allPosts) return 'Loading…';
  const total    = $defs.allPosts.length;
  const filtered = ($defs.filteredPosts || []).length;
  return ($defs.searchTerm || $defs.selectedUserId)
    ? `${filtered} of ${total} posts`
    : `${total} posts`;
}
