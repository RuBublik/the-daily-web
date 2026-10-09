// Editor review page: approve, return, edit and delete through the editor API, without a full page reload
// until the action is done. The server checks every action again; these buttons are only a shortcut.

(function () {
  const page = document.getElementById('editor-article');
  const message = document.getElementById('editor-message');
  const apiUrl = '/api/editor/articles/' + page.dataset.articleId;

  const editButton = document.getElementById('edit-button');
  const approveButton = document.getElementById('approve-button');
  const returnForm = document.getElementById('return-form');
  const editForm = document.getElementById('edit-form');
  const versions = document.getElementById('versions');
  const deleteButton = document.getElementById('delete-button');

  function showError(text) {
    message.textContent = text;
    message.className = 'editor-message error';
  }

  // sends one action, returns true when the server accepted it
  async function send(method, path, body) {
    const buttons = page.querySelectorAll('button');
    buttons.forEach((button) => {
      button.disabled = true;
    });
    message.textContent = 'Saving...';
    message.className = 'editor-message';

    try {
      const response = await fetch(apiUrl + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) {
        return true;
      }
      const data = await response.json().catch(() => ({}));
      showError(data.error || 'Something went wrong, try again');
    } catch (err) {
      showError('Could not reach the server, check your connection');
    }
    buttons.forEach((button) => {
      button.disabled = false;
    });
    return false;
  }

  // review buttons exist only while the article is pending
  if (approveButton) {
    approveButton.addEventListener('click', async () => {
      if (await send('POST', '/approve')) {
        location.reload();
      }
    });

    returnForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = returnForm.elements.note.value.trim();
      if (!note) {
        showError('Write a note explaining what needs fixing');
        return;
      }
      if (await send('POST', '/return', { note })) {
        location.reload();
      }
    });

    // editing is its own mode: save or cancel first, so nothing unsaved gets approved or returned
    const toggleEditing = (editing) => {
      editForm.hidden = !editing;
      versions.hidden = editing;
      editButton.hidden = editing;
      approveButton.hidden = editing;
      returnForm.hidden = editing;
    };

    editButton.addEventListener('click', () => toggleEditing(true));
    document.getElementById('edit-cancel').addEventListener('click', () => toggleEditing(false));

    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(editForm));
      if (await send('PATCH', '', fields)) {
        location.reload();
      }
    });
  }

  deleteButton.addEventListener('click', async () => {
    if (!confirm('Delete this article and its comments? This cannot be undone.')) {
      return;
    }
    if (await send('DELETE', '')) {
      location.href = '/editor';
    }
  });
})();
