// Reporter edit page: the draft is saved automatically, there is no "Save" button.
// After the reporter stops typing for a moment, the whole form is sent with PATCH /api/my-articles/:id.
// The server keeps the draft, so a refresh, a closed browser or another computer opens the latest saved version.

// IIFE: holds the autosave state. The article id comes from data-article-id on #reporter-article.
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

  // the small autosave text by the form ("Saving...", "All changes saved at ..."), red when isError
  function setSaveStatus(text, isError) {
    saveStatus.textContent = text;
    saveStatus.className = isError ? 'autosave-status error' : 'autosave-status';
  }

  // shows an error in the message area (used by delete and submit)
  function showError(text) {
    message.textContent = text;
    message.className = 'editor-message error';
  }

  // browsers refuse a keepalive request with a body over 64 KB, so long articles are sent without it
  const KEEPALIVE_LIMIT = 60000;

  // the PATCH request with the whole form. keepalive lets it finish even if the tab is closed meanwhile
  // it returns the fetch promise, the callers handle the answer
  function patchDraft() {
    const body = JSON.stringify(Object.fromEntries(new FormData(form)));
    return fetch(apiUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: new Blob([body]).size < KEEPALIVE_LIMIT,
    });
  }

  // one PATCH request, resolves to true when the server saved it. never throws
  // on success it shows the save time from the server. on a network error it tries again in 5 seconds.
  // on any failure unsaved goes back to true, so those changes are sent again later
  async function sendDraft() {
    setSaveStatus('Saving...');
    try {
      const response = await patchDraft();
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
  // called by the timer after typing stops, by the retry, and before submitting
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

  // any change in any field: marks it unsaved and restarts the 1 second timer (debounce), so a save
  // is sent only when the reporter pauses typing. this is the autosave that replaces a Save button
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
  // not while a save is in flight: the two requests could reach the server in the wrong order,
  // and the older text would overwrite the newer one. that save still finishes (keepalive), and
  // beforeunload below already warned the reporter that something was not saved yet
  window.addEventListener('pagehide', () => {
    if (unsaved && !saving) {
      patchDraft().catch(() => {});
    }
  });

  // and ask before leaving while a save has not finished
  window.addEventListener('beforeunload', (event) => {
    if (unsaved || saving) {
      event.preventDefault();
    }
  });

  // only on a never-published draft; the server checks the same rule again
  const deleteButton = document.getElementById('delete-button');
  if (deleteButton) {
    // Delete: confirm, stop the autosave, DELETE /api/my-articles/:id, then back to the reporter list
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Delete this draft? This cannot be undone.')) {
        return;
      }
      deleteButton.disabled = true;
      // nothing left to save: no autosave and no "leave page?" warning for a deleted draft
      clearTimeout(saveTimer);
      unsaved = false;
      try {
        const response = await fetch(apiUrl, { method: 'DELETE' });
        if (response.ok) {
          location.href = '/reporter';
          return;
        }
        const data = await response.json().catch(() => ({}));
        showError(data.error || 'Could not delete the draft');
      } catch (err) {
        showError('Could not reach the server, check your connection');
      }
      deleteButton.disabled = false;
    });
  }

  // Submit for approval: checks the form, saves the latest changes first, then POST /api/my-articles/:id/submit
  // moves the draft to pending (the server allows it only from draft or returned). reloads on success to show the new status
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
