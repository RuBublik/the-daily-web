// Sidebar weather widget: loads the current weather from our own server (GET /api/weather),
// which caches the external weather service. All text is set with textContent.

// IIFE: stops right away on pages without the widget markup (views/partials/weather.ejs in the sidebar).
(function () {
  const status = document.getElementById('weather-status');
  const body = document.getElementById('weather-body');
  if (!status || !body) {
    return;
  }

  // puts text into the element with this id, with textContent so data from the external service
  // is never parsed as HTML
  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  // fills the widget from the weather object our server returns (city, icon, temperature, feels like,
  // humidity, wind, time of the reading), then hides the loading text and shows the widget body
  function show(weather) {
    setText('weather-city', weather.city);
    setText('weather-icon', weather.icon);
    setText('weather-temp', weather.temperature + '°C');
    setText('weather-description', weather.description);
    setText('weather-feels-like', weather.feelsLike + '°C');
    setText('weather-humidity', weather.humidity + '%');
    setText('weather-wind', weather.windSpeed + ' km/h');
    const time = new Date(weather.updatedAt).toLocaleTimeString('en-US', { timeStyle: 'short' });
    setText('weather-updated', 'Updated ' + time);
    status.hidden = true;
    body.hidden = false;
  }

  // GET /api/weather. our server calls the external weather service (Open-Meteo) and caches the answer
  // for every reader, so the data may be a few minutes old (at most 15). on an error answer or no connection
  // a short message replaces the loading text and the widget body stays hidden
  async function load() {
    try {
      const response = await fetch('/api/weather');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        status.textContent = data.error || 'The weather is not available right now';
        return;
      }
      show(data);
    } catch (err) {
      status.textContent = 'Could not load the weather';
    }
  }

  load();
})();
