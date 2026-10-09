// Editor review page: approve, return, edit and delete through the editor API, without a full page reload
// until the action is done. The server checks every action again; these buttons are only a shortcut.

(function () {
  const page = document.getElementById('editor-article');
  const message = document.getElementById('editor-message');
  const apiUrl = '/api/editor/articles/' + page.dataset.articleId;

  const editButtons = page.querySelectorAll('[data-edit-form]');
  const editForms = page.querySelectorAll('.edit-form');
  const approveButton = document.getElementById('approve-button');
  const returnForm = document.getElementById('return-form');
  const versions = document.getElementById('versions');
  const deleteButton = document.getElementById('delete-button');

  function showError(text) {
    message.textContent = text;
    message.className = 'editor-message error';
  }

  // sends one action, returns true when the server accepted it
  async function send(method, path, body) {
    // only the buttons usable now, so a grayed-out one is not re-enabled afterwards
    const buttons = page.querySelectorAll('button:not(:disabled)');
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

  }

  // editing is its own mode: save or cancel first, so nothing unsaved gets approved or returned.
  // openForm is the edit form to show, or null to leave editing
  function toggleEditing(openForm) {
    const editing = openForm !== null;
    editForms.forEach((form) => {
      form.hidden = form !== openForm;
    });
    editButtons.forEach((button) => {
      button.hidden = editing;
    });
    versions.hidden = editing;
    if (approveButton) {
      approveButton.hidden = editing;
      returnForm.hidden = editing;
    }
  }

  // a disabled (grayed-out) button gets no clicks, so only usable versions open
  editButtons.forEach((button) => {
    button.addEventListener('click', () => toggleEditing(document.getElementById(button.dataset.editForm)));
  });

  // each form saves its own version: PATCH .../draft or .../live
  editForms.forEach((form) => {
    form.querySelector('.edit-cancel').addEventListener('click', () => toggleEditing(null));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      if (await send('PATCH', '/' + form.dataset.target, fields)) {
        location.reload();
      }
    });
  });

  deleteButton.addEventListener('click', async () => {
    if (!confirm('Delete this article and its comments? This cannot be undone.')) {
      return;
    }
    if (await send('DELETE', '')) {
      location.href = '/editor';
    }
  });
})();
