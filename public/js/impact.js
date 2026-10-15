// Impact Analytics page: pick a published article and see its views over time (per hour, day or
// month, the server picks by the range length), with a dashed line at every approval and a
// before / after table. Data comes from GET /api/articles/:id/stats.

(function () {
  const page = document.getElementById('impact');
  const search = document.getElementById('impact-search');
  const results = document.getElementById('impact-results');
  const rangeButtons = page.querySelectorAll('[data-range]');
  const message = document.getElementById('impact-message');
  const chartBox = document.getElementById('impact-chart-box');
  const canvas = document.getElementById('impact-chart');
  const table = document.getElementById('impact-updates');
  const tableBody = document.getElementById('impact-updates-body');

  let articleId = page.dataset.selectedId || null;
  let range = page.dataset.defaultRange;
  let chart = null;
  let searchTimer = null;
  let latestRequest = 0;
  let latestSearch = 0;

  function formatHour(date, withDay) {
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!withDay) {
      return time;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
  }

  // the x axis label of a point, by the chart's step
  function pointLabel(time, data) {
    if (data.step === 'month') {
      return time.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    if (data.step === 'day') {
      return time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return formatHour(time, data.range !== '24h');
  }

  function updateLabel(update) {
    return update.first ? 'Published' : 'Update ' + update.number;
  }

  // Chart.js plugin of our own: a dashed vertical line and a label at every approval
  const approvalMarkers = {
    id: 'approvalMarkers',
    afterDatasetsDraw(chartInstance, args, options) {
      const { ctx, chartArea, scales } = chartInstance;
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.fillStyle = '#dc2626';
      ctx.font = '12px sans-serif';
      ctx.setLineDash([6, 4]);
      options.markers.forEach((marker, index) => {
        const x = scales.x.getPixelForValue(marker.index);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        // each label one line lower than the one before, so close approvals don't overlap
        ctx.fillText(marker.label, x + 4, chartArea.top + 12 + index * 14);
      });
      ctx.restore();
    },
  };

  function drawChart(data) {
    const labels = data.points.map((point) => pointLabel(new Date(point.time), data));
    const counts = data.points.map((point) => point.count);
    // each approval sits on the point (hour, day or month) it happened in: the last one starting before it
    const markers = data.updates.map((update) => ({
      index: data.points.findLastIndex((point) => new Date(point.time) <= new Date(update.at)),
      label: updateLabel(update),
    }));

    if (chart) {
      chart.destroy();
    }
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Views per ' + data.step,
          data: counts,
          borderColor: '#0b74de',
          backgroundColor: '#0b74de',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Time' }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
          y: { title: { display: true, text: 'Views' }, beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { display: false },
          approvalMarkers: { markers },
        },
      },
      plugins: [approvalMarkers],
    });
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) {
      td.className = className;
    }
    return td;
  }

  function fillTable(updates) {
    tableBody.replaceChildren();
    updates.forEach((update) => {
      const row = document.createElement('tr');
      const at = new Date(update.at);
      row.appendChild(cell(at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + formatHour(at, false)));
      // older than the hourly history: compared day before against day after, so less exact
      row.appendChild(cell(updateLabel(update) + (update.daily ? ' (daily)' : '')));
      row.appendChild(cell(update.before === null ? '-' : update.before + '/h'));
      row.appendChild(cell(update.after + '/h' + (update.soFar ? ' (so far)' : '')));
      if (update.change === null) {
        row.appendChild(cell('-'));
      } else {
        const sign = update.change > 0 ? '+' : '';
        row.appendChild(cell(sign + update.change + '%', update.change >= 0 ? 'change-up' : 'change-down'));
      }
      tableBody.appendChild(row);
    });
    table.hidden = updates.length === 0;
  }

  async function load() {
    if (!articleId) {
      return;
    }
    const requestId = ++latestRequest;
    message.textContent = 'Loading...';

    try {
      const response = await fetch('/api/articles/' + articleId + '/stats?range=' + range);
      const data = await response.json();
      // a newer request was sent meanwhile, its answer wins
      if (requestId !== latestRequest) {
        return;
      }
      if (!response.ok) {
        message.textContent = data.error || 'Could not load the statistics';
        chartBox.hidden = true;
        table.hidden = true;
        return;
      }

      chartBox.hidden = false;
      drawChart(data);
      fillTable(data.updates);
      const period = data.range === 'all' ? ' since it was first published' : ' in the last ' + data.range;
      message.textContent = data.totalViews + ' views' + period + ', per ' + data.step +
        (data.updates.length === 0 ? ', no approvals in this range.' : '.');
      // keep the choice in the address bar, so a refresh or a shared link shows the same chart
      history.replaceState(null, '', '/impact?article=' + articleId + '&range=' + range);
    } catch (err) {
      if (requestId === latestRequest) {
        message.textContent = 'Could not load the statistics, check your connection';
      }
    }
  }

  function selectArticle(article) {
    articleId = article._id;
    search.value = article.title;
    results.hidden = true;
    load();
  }

  // published articles matching the search, most viewed first (the public list API)
  async function showResults() {
    const query = new URLSearchParams({ sort: 'popular' });
    if (search.value.trim()) {
      query.set('q', search.value.trim());
    }
    const searchId = ++latestSearch;
    try {
      const response = await fetch('/api/articles?' + query);
      const data = await response.json();
      // a newer search was sent meanwhile, its answer wins
      if (searchId !== latestSearch) {
        return;
      }
      results.replaceChildren();
      (data.articles || []).forEach((article) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = article.title;
        button.addEventListener('click', () => selectArticle(article));
        item.appendChild(button);
        results.appendChild(item);
      });
      if (results.children.length === 0) {
        const item = document.createElement('li');
        item.textContent = 'No published articles found.';
        results.appendChild(item);
      }
      results.hidden = false;
    } catch (err) {
      if (searchId === latestSearch) {
        message.textContent = 'Could not search articles, check your connection';
      }
    }
  }

  search.addEventListener('focus', showResults);
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(showResults, 300);
  });
  // close the list when clicking elsewhere
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.impact-picker')) {
      results.hidden = true;
    }
  });

  rangeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      range = button.dataset.range;
      rangeButtons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      load();
    });
  });

  // a shared link may carry a range too
  const linkedRange = new URLSearchParams(location.search).get('range');
  const linkedButton = Array.from(rangeButtons).find((button) => button.dataset.range === linkedRange);
  if (linkedButton) {
    linkedButton.click();
  } else {
    load();
  }
})();
