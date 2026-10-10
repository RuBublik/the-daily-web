// Reporter edit page: the draft is saved automatically, there is no "Save" button.
// After the reporter stops typing for a moment, the whole form is sent with PATCH /api/my-articles/:id.
// The server keeps the draft, so a refresh, a closed browser or another computer opens the latest saved version.

(function () {
  const page = document.getElementById('reporter-article');
  const form = document.getElementById('draft-form');
  const saveStatus = document.getElementById('autosave-status');
  const message = document.getElementById('reporter-message');
  const submitButton = document.getElementById('submit-button');
  const apiUrl = '/api/my-articles/' + page.dataset.articleId;

  // wait this long after the last keystroke before saving
  const SAVE_DELAY = 1000;
  // after a network error, try again on its own
  const RETRY_DELAY = 5000;

  let saveTimer = null;
  let unsaved = false; // changes typed but not saved yet
  let saving = null; // the save request in flight, if any

  function setSaveStatus(text, isError) {
    saveStatus.textContent = text;
    saveStatus.className = isError ? 'autosave-status error' : 'autosave-status';
  }

  function showError(text) {
    message.textContent = text;
    message.className = 'editor-message error';
  }

  function draftBody() {
    return JSON.stringify(Object.fromEntries(new FormData(form)));
  }

  // one PATCH request, resolves to true when the server saved it. never throws
  async function sendDraft() {
    setSaveStatus('Saving...');
    try {
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: draftBody(),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const time = new Date(data.lastUpdated).toLocaleTimeString('en-US', { timeStyle: 'short' });
        setSaveStatus('All changes saved at ' + time);
        return true;
      }
      setSaveStatus('Not saved: ' + (data.error || 'something went wrong'), true);
    } catch (err) {
      setSaveStatus('Not saved: no connection. Trying again...', true);
      saveTimer = setTimeout(save, RETRY_DELAY);
    }
    // what failed is still not on the server
    unsaved = true;
    return false;
  }

  // saves the current form if it has unsaved changes. resolves to true when nothing is left unsaved
  async function save() {
    clearTimeout(saveTimer);
    // one request at a time, so an older save never lands after a newer one
    while (saving) {
      await saving;
    }
    if (!unsaved) {
      return true;
    }
    unsaved = false;
    saving = sendDraft();
    const saved = await saving;
    saving = null;
    return saved;
  }

  form.addEventListener('input', () => {
    unsaved = true;
    setSaveStatus('Unsaved changes...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  });

  // the form has no submit button, but Enter in a field must not reload the page
  form.addEventListener('submit', (event) => event.preventDefault());

  // closing or leaving the page before the timer fired: send the last changes anyway.
  // keepalive lets the request finish after the page is gone
  window.addEventListener('pagehide', () => {
    if (unsaved) {
      fetch(apiUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: draftBody(),
        keepalive: true,
      });
    }
  });

  // and ask before leaving while a save has not finished
  window.addEventListener('beforeunload', (event) => {
    if (unsaved || saving) {
      event.preventDefault();
    }
  });

  submitButton.addEventListener('click', async () => {
    message.textContent = '';
    // the browser checks the required fields and the image URL; the server checks them again
    if (!form.reportValidity()) {
      return;
    }

    submitButton.disabled = true;
    // the editor must get exactly what is on the screen
    if (!(await save())) {
      showError('Could not save your latest changes, so the article was not submitted. Try again.');
      submitButton.disabled = false;
      return;
    }

    try {
      const response = await fetch(apiUrl + '/submit', { method: 'POST' });
      if (response.ok) {
        location.reload();
        return;
      }
      const data = await response.json().catch(() => ({}));
      showError(data.error || 'Could not submit the article');
    } catch (err) {
      showError('Could not reach the server, check your connection');
    }
    submitButton.disabled = false;
  });
})();
