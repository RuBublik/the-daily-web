// Reporter article list: the server already rendered the first page.
// This script filters by status, loads more rows and creates a new article, all via Ajax.

// IIFE: keeps the list state private. page is the last page loaded, used by "Load more".
(function () {
  const form = document.getElementById('reporter-filters');
  const rows = document.getElementById('reporter-articles');
  const listStatus = document.getElementById('reporter-list-status');
  const loadMoreButton = document.getElementById('reporter-load-more');
  const newArticleButton = document.getElementById('new-article-button');
  const message = document.getElementById('reporter-message');

  let page = 1;
  let latestRequest = 0;

  // wraps a DOM node in a new <td>
  function cell(child) {
    const td = document.createElement('td');
    td.appendChild(child);
    return td;
  }

  // a <span> with a CSS class and text (set with textContent), used for the status pill and the update badge
  function span(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  // same markup as views/partials/reporter-article-row.ejs. never innerHTML: titles must not inject HTML
  // builds one table row (title linking to the edit page, category, status, last update)
  function createRow(article) {
    const row = document.createElement('tr');

    const link = document.createElement('a');
    link.href = '/reporter/articles/' + article._id;
    link.textContent = article.title;
    row.appendChild(cell(link));
    row.appendChild(cell(document.createTextNode(article.category)));

    const statusCell = cell(span('status-pill ' + article.status, article.status));
    if (article.isUpdate) {
      statusCell.appendChild(document.createTextNode(' '));
      statusCell.appendChild(span('update-badge', 'update'));
    }
    row.appendChild(statusCell);

    const date = document.createElement('time');
    date.dateTime = article.lastUpdated;
    date.textContent = new Date(article.lastUpdated).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    row.appendChild(cell(date));

    return row;
  }

  // replace: true for a new filter, false to append the next page
  // GET /api/my-articles: the server returns only the logged-in reporter's articles, by the session,
  // never by anything the browser sends. only the newest request's answer is shown
  async function load(pageNumber, replace) {
    const requestId = ++latestRequest;
    const status = form.elements.status.value;
    const query = new URLSearchParams({ status, page: pageNumber });
    listStatus.textContent = 'Loading...';

    try {
      const response = await fetch('/api/my-articles?' + query);
      const data = await response.json();
      // a newer request was sent meanwhile, its answer wins
      if (requestId !== latestRequest) {
        return;
      }
      if (!response.ok) {
        listStatus.textContent = data.error || 'Could not load articles';
        return;
      }

      if (replace) {
        rows.replaceChildren();
        // keep the filter in the address bar, so a refresh shows the same list
        history.replaceState(null, '', '/reporter?status=' + encodeURIComponent(status));
      }
      data.articles.forEach((article) => rows.appendChild(createRow(article)));
      page = data.page;
      loadMoreButton.hidden = !data.hasMore;
      listStatus.textContent = rows.children.length === 0 ? 'No articles found.' : '';
    } catch (err) {
      if (requestId === latestRequest) {
        listStatus.textContent = 'Could not load articles, check your connection';
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load(1, true);
  });
  form.elements.status.addEventListener('change', () => load(1, true));
  loadMoreButton.addEventListener('click', () => load(page + 1, false));

  // the article is created on the server right away, so autosave has somewhere to write
  // POST /api/my-articles creates an empty draft, then the browser opens its edit page.
  // on error the server's message is shown and the button is enabled again
  newArticleButton.addEventListener('click', async () => {
    newArticleButton.disabled = true;
    message.textContent = '';
    try {
      const response = await fetch('/api/my-articles', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        location.href = '/reporter/articles/' + data._id;
        return;
      }
      message.textContent = data.error || 'Could not create the article';
    } catch (err) {
      message.textContent = 'Could not reach the server, check your connection';
    }
    message.className = 'editor-message error';
    newArticleButton.disabled = false;
  });
})();
