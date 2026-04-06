/**
 * index.js — external functions for the examples index page.
 * Used via $src on $prototype: "Function" entries.
 */

const SOURCES = {
  counter:    './counter/counter.json',
  computed:   './computed/user-card.json',
  list:       './list/dynamic-list.json',
  fetch:      './fetch/fetch-demo.json',
  switch:     './switch/router.json',
  form:       './form/contact-form.json',
  responsive: './responsive/responsive-card.json',
  todo:       './todo/todo-app.json',
};

async function loadSource(id, signal) {
  signal.set('Loading...');
  try {
    const res  = await fetch(SOURCES[id]);
    const text = await res.text();
    signal.set(text);
  } catch (e) {
    signal.set(`// Error loading source\n// ${e.message}`);
  }
}

export async function selectTab(event) {
  const id = event.currentTarget.dataset.tab;
  if (!id || !SOURCES[id]) return;
  this.$activeTab.set(id);
  this.$iframeSrc.set(`./${id}/index.html`);
  await loadSource(id, this.$sourceText);
}

export async function onMount() {
  await loadSource(this.$activeTab.get(), this.$sourceText);
}
