const test = require('node:test');
const assert = require('node:assert/strict');

// the controller keeps its cache in the module, so every test loads a fresh copy
function freshController() {
  delete require.cache[require.resolve('../controllers/weatherController')];
  return require('../controllers/weatherController');
}

const goodAnswer = {
  current: {
    temperature_2m: 24.6,
    apparent_temperature: 26.1,
    relative_humidity_2m: 60,
    wind_speed_10m: 12.4,
    weather_code: 2,
  },
};

// replaces the global fetch, and counts how often the weather service is called
function mockFetch(t, answer) {
  const calls = { count: 0 };
  t.mock.method(globalThis, 'fetch', async () => {
    calls.count += 1;
    if (answer instanceof Error) {
      throw answer;
    }
    return { ok: true, status: 200, json: async () => answer };
  });
  return calls;
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('turns the service answer into widget data', () => {
  const { toWidgetData } = freshController();
  const data = toWidgetData(goodAnswer, Date.parse('2026-10-10T12:00:00Z'));
  assert.equal(data.temperature, 25);
  assert.equal(data.feelsLike, 26);
  assert.equal(data.humidity, 60);
  assert.equal(data.windSpeed, 12);
  assert.equal(data.description, 'Partly cloudy');
  assert.equal(data.updatedAt, '2026-10-10T12:00:00.000Z');
});

test('rejects an answer without current weather', () => {
  const { toWidgetData } = freshController();
  assert.throws(() => toWidgetData({}, Date.now()));
  assert.throws(() => toWidgetData(null, Date.now()));
});

test('an unknown weather code still gets a description', () => {
  const { describe } = freshController();
  assert.equal(describe(1234).text, 'Unknown');
});

test('many requests share one call to the weather service', async (t) => {
  const calls = mockFetch(t, goodAnswer);
  const { getWeather } = freshController();

  // arriving together, while the first call is still in flight
  const answers = await Promise.all([getWeather(), getWeather(), getWeather()]);
  // and later, from the cache
  answers.push(await getWeather());

  assert.equal(calls.count, 1);
  answers.forEach((answer) => assert.equal(answer.temperature, 25));
});

test('a failing service gets 503, not a crash, and is not called again right away', async (t) => {
  const calls = mockFetch(t, new Error('network down'));
  t.mock.method(console, 'error', () => {});
  const { getCurrentWeather } = freshController();

  let res = mockRes();
  await getCurrentWeather({}, res);
  assert.equal(res.statusCode, 503);
  assert.ok(res.body.error);

  res = mockRes();
  await getCurrentWeather({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(calls.count, 1);
});
