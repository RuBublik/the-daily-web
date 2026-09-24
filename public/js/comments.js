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

  async function loadComments(articleId, listEl) {
    try {
      const res = await fetch(`/api/articles/${articleId}/comments`);
      if (!res.ok) throw new Error('Failed to load comments');
      const comments = await res.json();
      listEl.innerHTML = '';
      comments.forEach((comment) => listEl.appendChild(commentToListItem(comment)));
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

    loadComments(articleId, listEl);

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
