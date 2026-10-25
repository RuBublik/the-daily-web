// Every visit to an article page is reported to the server,
// so it counts toward the article's view statistics.
// The route is POST /api/articles/:id/view.

// IIFE: runs once when the script loads and keeps its variables out of the global scope.
// Reads the article id from data-article-id on .article-page (set by the EJS view) and sends
// a fire-and-forget POST. The page does not wait for the answer or show anything about it.
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
