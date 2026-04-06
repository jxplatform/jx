export default {
  selectPost(event) {
    const slug = event.target.dataset?.slug;
    if (slug) {
      this.$currentSlug.set(slug);
    }
  }
};
