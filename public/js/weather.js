// Sidebar weather widget: loads the current weather from our own server (GET /api/weather),
// which caches the external weather service. All text is set with textContent.

(function () {
  const status = document.getElementById('weather-status');
  const body = document.getElementById('weather-body');
  if (!status || !body) {
    return;
  }

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

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
