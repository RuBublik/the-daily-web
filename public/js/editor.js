// Editor article list: the server already rendered the first page.
// This script re-queries on filter or search and loads more rows, all via Ajax (no full page reload).

(function () {
  const form = document.getElementById('editor-filters');
  const rows = document.getElementById('editor-articles');
  const listStatus = document.getElementById('editor-list-status');
  const loadMoreButton = document.getElementById('editor-load-more');

  let page = 1;
  let latestRequest = 0;
  let searchTimer = null;

  // the form values as a query string, without empty ones
  function buildQuery(pageNumber) {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, name) => {
      if (value) {
        params.set(name, value);
      }
    });
    params.set('page', pageNumber);
    return params;
  }

  function cell(child) {
    const td = document.createElement('td');
    td.appendChild(child);
    return td;
  }

  function span(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  // same markup as views/partials/editor-article-row.ejs. never innerHTML: titles must not inject HTML
  function createRow(article) {
    const row = document.createElement('tr');

    const link = document.createElement('a');
    link.href = '/editor/articles/' + article._id;
    link.textContent = article.title;
    row.appendChild(cell(link));
    row.appendChild(cell(document.createTextNode(article.authorName)));
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

  // replace: true for a new filter or search, false to append the next page
  async function load(pageNumber, replace) {
    const requestId = ++latestRequest;
    const query = buildQuery(pageNumber);
    listStatus.textContent = 'Loading...';

    try {
      const response = await fetch('/api/editor/articles?' + query);
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
        // keep the filters in the address bar, so a refresh shows the same list
        query.delete('page');
        history.replaceState(null, '', '/editor?' + query);
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

  form.querySelector('select[name="status"]').addEventListener('change', () => load(1, true));

  // wait until the editor stops typing
  form.querySelector('input[name="q"]').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(1, true), 300);
  });

  loadMoreButton.addEventListener('click', () => load(page + 1, false));
})();
