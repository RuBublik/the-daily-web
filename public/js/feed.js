// Home feed: the server already rendered the first 20 articles.
// This script loads the next pages on scroll and re-queries on search, filter or sort,
// all via Ajax (no full page reload).

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

  function updateStatus() {
    if (grid.children.length === 0) {
      status.textContent = 'No articles found.';
    } else if (!hasMore) {
      status.textContent = 'You have reached the end.';
    } else {
      status.textContent = '';
    }
  }

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

  function applyFilters() {
    // keeps the address bar in sync, so a refresh or a shared link
    // shows the same results, rendered by the server
    history.replaceState(null, '', '/?' + buildQuery().toString());
    fetchPage(1, true);
  }

  // start loading a bit before the reader reaches the bottom
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !loading) {
      fetchPage(page + 1, false);
    }
  }, { rootMargin: '300px' });
  observer.observe(sentinel);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  form.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', applyFilters);
  });

  // wait until the reader stops typing instead of sending a request per keystroke
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 300);
  });
})();
