// Home feed: the server already rendered the first 20 articles.
// This script loads the next pages on scroll and re-queries on search, filter or sort,
// all via Ajax (no full page reload).

// IIFE: keeps the feed state (current page, hasMore, loading) private to this script.
// hasMore starts from data-has-more on #feed-sentinel, which the server set for the first page.
(function () {
  const form = document.getElementById('feed-filters');
  const grid = document.getElementById('articles-grid');
  const status = document.getElementById('feed-status');
  const sentinel = document.getElementById('feed-sentinel');
  const searchInput = form.querySelector('input[name="q"]');

  let page = 1;
  let hasMore = sentinel.dataset.hasMore === 'true';
  let loading = false;
  let latestRequest = 0;
  let searchTimer = null;

  // the form values as a query string, without empty ones
  // (q, category, viewed, sort) plus the page number when given.
  // used both for the GET /api/articles call and for the address bar
  function buildQuery(pageNumber) {
    const params = new URLSearchParams();
    const formData = new FormData(form);
    formData.forEach((value, name) => {
      if (value) {
        params.set(name, value);
      }
    });
    if (pageNumber) {
      params.set('page', pageNumber);
    }
    return params;
  }

  // same markup as views/partials/article-card.ejs
  // builds one article preview card (image, category badge, title link, summary, author, date, views)
  // from an article object returned by GET /api/articles
  function createCard(article) {
    // never innerHTML: article text must not be able to inject HTML
    const card = document.createElement('article');
    card.className = 'article-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'card-image-wrapper';
    const img = document.createElement('img');
    img.src = article.image;
    img.alt = article.title;
    img.loading = 'lazy';
    const badge = document.createElement('span');
    badge.className = 'category-badge';
    badge.textContent = article.category;
    imageWrapper.appendChild(img);
    imageWrapper.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'card-content';

    const title = document.createElement('h3');
    title.className = 'card-title';
    const link = document.createElement('a');
    link.href = '/article/' + article._id;
    link.textContent = article.title;
    title.appendChild(link);

    const summary = document.createElement('p');
    summary.className = 'card-summary';
    summary.textContent = article.summary;

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const author = document.createElement('span');
    author.textContent = 'By ' + article.authorName;
    const date = document.createElement('time');
    date.dateTime = article.publishDate;
    date.textContent = new Date(article.publishDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const views = document.createElement('span');
    views.textContent = article.viewCount + ' views';
    meta.appendChild(author);
    meta.appendChild(date);
    meta.appendChild(views);

    content.appendChild(title);
    content.appendChild(summary);
    content.appendChild(meta);

    card.appendChild(imageWrapper);
    card.appendChild(content);
    return card;
  }

  // sets the text under the grid: no results, end of the list, or empty while more pages exist
  function updateStatus() {
    if (grid.children.length === 0) {
      status.textContent = 'No articles found.';
    } else if (!hasMore) {
      status.textContent = 'You have reached the end.';
    } else {
      status.textContent = '';
    }
  }

  // fetches one page from GET /api/articles with the current filters. replace: true clears the grid
  // first (new search, filter or sort), false appends to it (infinite scroll). latestRequest makes sure only
  // the newest request's answer is used, so a slow older search cannot overwrite newer results.
  // on error a message is shown in #feed-status instead of the cards
  async function fetchPage(pageNumber, replace) {
    loading = true;
    latestRequest++;
    const requestNumber = latestRequest;
    let data = null;

    try {
      const res = await fetch('/api/articles?' + buildQuery(pageNumber).toString());
      if (!res.ok) {
        throw new Error('Request failed with status ' + res.status);
      }
      data = await res.json();
    } catch (err) {
      console.error(err);
    }

    if (requestNumber !== latestRequest) {
      return;
    }
    loading = false;

    if (!data) {
      status.textContent = 'Could not load articles. Please try again.';
      return;
    }

    if (replace) {
      grid.innerHTML = '';
    }
    data.articles.forEach((article) => grid.appendChild(createCard(article)));
    page = data.page;
    hasMore = data.hasMore;
    updateStatus();

    // re-observing makes the browser report the current position again,
    // so a sentinel that is still on screen triggers the next page
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  // called when the search, category, viewed or sort changes: reloads the feed from page 1
  function applyFilters() {
    // keeps the address bar in sync, so a refresh or a shared link
    // shows the same results, rendered by the server
    history.replaceState(null, '', '/?' + buildQuery().toString());
    fetchPage(1, true);
  }

  // start loading a bit before the reader reaches the bottom
  // infinite scroll: the observer watches the empty #feed-sentinel element below the grid. when it
  // comes within 300px of the screen and more pages exist, the next 20 articles are fetched and appended
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !loading) {
      fetchPage(page + 1, false);
    }
  }, { rootMargin: '300px' });
  observer.observe(sentinel);

  // Enter in the search box: handled with Ajax instead of a full page submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  // a change in the category, viewed or sort dropdown re-queries right away
  form.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', applyFilters);
  });

  // wait until the reader stops typing instead of sending a request per keystroke
  // (a debounce: every keystroke restarts a 300 ms timer, the search runs when it fires)
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 300);
  });
})();
