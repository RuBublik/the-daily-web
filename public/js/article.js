// Every visit to an article page is reported to the server,
// so it counts toward the article's view statistics.
// The route is POST /api/articles/:id/view.

(function () {
  const articleEl = document.querySelector('.article-page');
  if (!articleEl) {
    return;
  }

  const id = articleEl.dataset.articleId;

  fetch('/api/articles/' + id + '/view', { method: 'POST' })
    .catch((err) => {
      // counting a view must never break the page for the reader
      console.error('Could not record view:', err);
    });
})();
