// Editor review page: approve, return, edit and delete through the editor API, without a full page reload
// until the action is done. The server checks every action again; these buttons are only a shortcut.

// IIFE: reads the article id from data-article-id on #editor-article and builds the base URL
// /api/editor/articles/:id that every action below is sent to.
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

  // shows an error text in the message area, the error class colors it red
  function showError(text) {
    message.textContent = text;
    message.className = 'editor-message error';
  }

  // sends one action, returns true when the server accepted it
  // method and path pick the action: POST /approve, POST /return, PATCH /draft or /live, DELETE ''.
  // the buttons are disabled while it runs so an action cannot be sent twice. on failure the server's error
  // (or a connection error) is shown, the buttons are enabled again and it returns false
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
    // Approve: POST .../approve publishes the pending draft, then a reload shows the new state
    approveButton.addEventListener('click', async () => {
      if (await send('POST', '/approve')) {
        location.reload();
      }
    });

    // Return to reporter: a note is required (checked here and again on the server), sent with POST .../return
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
  // it shows only that form and hides the edit buttons, the versions view and the review controls
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
    // saving an edit form: all its fields are sent as JSON, and the page reloads on success
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      if (await send('PATCH', '/' + form.dataset.target, fields)) {
        location.reload();
      }
    });
  });

  // Delete: asks for confirmation, sends DELETE /api/editor/articles/:id (the article and its comments),
  // then goes back to the editor list
  deleteButton.addEventListener('click', async () => {
    if (!confirm('Delete this article and its comments? This cannot be undone.')) {
      return;
    }
    if (await send('DELETE', '')) {
      location.href = '/editor';
    }
  });
})();
