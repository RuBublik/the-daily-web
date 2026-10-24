// Weather widget data: GET /api/weather.
// The data comes from Open-Meteo (https://open-meteo.com), a free weather service that needs
// no account, API key or credit card, so there is no secret to keep out of the repository.
// Every reader shares one cached answer: the external service is called at most once every
// 10 minutes, however many pages are opened at the same time.

const API_URL = 'https://api.open-meteo.com/v1/forecast';
// a fresh answer is reused for this long
const CACHE_MS = 10 * 60 * 1000;
// if the service is down, an older answer is still shown up to this age (the widget may lag at most 15 minutes)
const MAX_AGE_MS = 15 * 60 * 1000;
// after a failed call, wait this long before calling the service again
const RETRY_AFTER_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

// the city shown in the widget, can be changed in .env
const place = {
  city: process.env.WEATHER_CITY || 'Tel Aviv',
  latitude: Number(process.env.WEATHER_LAT) || 32.08,
  longitude: Number(process.env.WEATHER_LON) || 34.78,
};

// Open-Meteo describes the sky with WMO weather codes
const CONDITIONS = [
  { codes: [0], text: 'Clear sky', icon: '☀️' },
  { codes: [1], text: 'Mainly clear', icon: '🌤️' },
  { codes: [2], text: 'Partly cloudy', icon: '⛅' },
  { codes: [3], text: 'Overcast', icon: '☁️' },
  { codes: [45, 48], text: 'Fog', icon: '🌫️' },
  { codes: [51, 53, 55, 56, 57], text: 'Drizzle', icon: '🌦️' },
  { codes: [61, 63, 65, 66, 67], text: 'Rain', icon: '🌧️' },
  { codes: [71, 73, 75, 77], text: 'Snow', icon: '❄️' },
  { codes: [80, 81, 82], text: 'Rain showers', icon: '🌦️' },
  { codes: [85, 86], text: 'Snow showers', icon: '🌨️' },
  { codes: [95, 96, 99], text: 'Thunderstorm', icon: '⛈️' },
];

let cache = null; // { data, fetchedAt }
let refreshing = null; // the call in flight, shared by every request that arrives meanwhile
let lastFailureAt = 0;

function describe(code) {
  return CONDITIONS.find((condition) => condition.codes.includes(code)) || { text: 'Unknown', icon: '🌡️' };
}

// only what the widget shows, so the client does not depend on the external service's format
function toWidgetData(body, fetchedAt) {
  const current = body?.current;
  if (!current || typeof current.temperature_2m !== 'number') {
    throw new Error('Unexpected answer from the weather service');
  }
  const condition = describe(current.weather_code);
  return {
    city: place.city,
    temperature: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    description: condition.text,
    icon: condition.icon,
    updatedAt: new Date(fetchedAt).toISOString(),
  };
}

async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    timezone: 'auto',
  });
  // a slow service must not keep the reader's request waiting
  const response = await fetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Weather service answered ${response.status}`);
  }
  return toWidgetData(await response.json(), Date.now());
}

// the weather to show, or null when there is none recent enough. never throws
async function getWeather() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  // a service that just failed is not called again by every request that follows
  if (Date.now() - lastFailureAt >= RETRY_AFTER_MS) {
    if (!refreshing) {
      refreshing = fetchWeather()
        .then((data) => {
          cache = { data, fetchedAt: Date.now() };
        })
        .catch((err) => {
          lastFailureAt = Date.now();
          // fetch hides the real reason (DNS, certificate, timeout...) in err.cause
          console.error('Could not refresh the weather:', err.cause?.code || err.cause?.message || err.message);
        })
        .finally(() => {
          refreshing = null;
        });
    }
    await refreshing;
  }

  if (cache && Date.now() - cache.fetchedAt < MAX_AGE_MS) {
    return cache.data;
  }
  return null;
}

// GET /api/weather
async function getCurrentWeather(req, res) {
  const weather = await getWeather();
  if (!weather) {
    return res.status(503).json({ error: 'The weather is not available right now' });
  }
  res.json(weather);
}

module.exports = { getCurrentWeather, getWeather, toWidgetData, describe };
