// Comments widget: loads existing comments for an article and lets a guest post a new one,
// entirely via Ajax (no full page reload).

(function () {
  function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
  }

  function commentToListItem(comment) {
    const li = document.createElement('li');
    li.className = 'comment';

    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    meta.dir = 'auto'; // names/content may be Hebrew or English — let the browser pick direction
    meta.textContent = `${comment.authorName} · ${formatDate(comment.createdAt)}`;

    const body = document.createElement('p');
    body.className = 'comment-text';
    body.dir = 'auto';
    body.textContent = comment.text; // textContent, never innerHTML — avoids XSS

    li.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  // loads one page of comments. without `before` it is the first page and replaces the list;
  // with it (the id of the last comment loaded so far) the comments after that one are appended.
  // an id and not a page number, so a comment posted meanwhile never shows a comment twice
  async function loadComments(articleId, listEl, loadMoreBtn, before) {
    try {
      const query = before ? `?before=${before}` : '';
      const res = await fetch(`/api/articles/${articleId}/comments${query}`);
      if (!res.ok) throw new Error('Failed to load comments');
      const data = await res.json();
      if (!before) {
        listEl.innerHTML = '';
      }
      data.comments.forEach((comment) => listEl.appendChild(commentToListItem(comment)));
      loadMoreBtn.hidden = !data.hasMore;
      if (data.comments.length > 0) {
        loadMoreBtn.dataset.before = data.comments[data.comments.length - 1]._id;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function initComments(section) {
    const articleId = section.dataset.articleId;
    const listEl = section.querySelector('#comments-list');
    const form = section.querySelector('#comment-form');
    const errorEl = section.querySelector('#comments-error');
    const authorInput = section.querySelector('#comment-author');
    const textInput = section.querySelector('#comment-text');
    const loadMoreBtn = section.querySelector('#comments-load-more');

    loadComments(articleId, listEl, loadMoreBtn);

    loadMoreBtn.addEventListener('click', () => {
      loadComments(articleId, listEl, loadMoreBtn, loadMoreBtn.dataset.before);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      try {
        const res = await fetch(`/api/articles/${articleId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorName: authorInput.value,
            text: textInput.value,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error || 'Could not post comment.';
          errorEl.hidden = false;
          return;
        }

        listEl.insertBefore(commentToListItem(data), listEl.firstChild);
        textInput.value = '';
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Network error — please try again.';
        errorEl.hidden = false;
      }
    });
  }

  document.querySelectorAll('.comments').forEach(initComments);
})();
