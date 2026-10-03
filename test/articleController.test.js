const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeedQuery } = require('../controllers/articleController');

test('parseFeedQuery returns defaults for an empty query', () => {
  const result = parseFeedQuery({});
  assert.deepStrictEqual(result, {
    filters: { q: '', category: '', viewed: '', sort: 'date', page: 1 },
  });
});

test('parseFeedQuery accepts a valid full query and trims q', () => {
  const result = parseFeedQuery({
    q: '  council  ',
    category: 'Science',
    viewed: 'unviewed',
    sort: 'popular',
    page: '3',
  });
  assert.deepStrictEqual(result, {
    filters: { q: 'council', category: 'Science', viewed: 'unviewed', sort: 'popular', page: 3 },
  });
});

test('parseFeedQuery rejects an unknown category', () => {
  assert.ok(parseFeedQuery({ category: 'Nope' }).error);
});

test('parseFeedQuery rejects an unknown sort', () => {
  assert.ok(parseFeedQuery({ sort: 'random' }).error);
});

test('parseFeedQuery rejects an unknown viewed value', () => {
  assert.ok(parseFeedQuery({ viewed: 'maybe' }).error);
});

test('parseFeedQuery rejects page 0, -1, abc and 1.5', () => {
  for (const page of ['0', '-1', 'abc', '1.5']) {
    assert.ok(parseFeedQuery({ page }).error, `page ${page} should be rejected`);
  }
});

test('parseFeedQuery rejects a page above the maximum', () => {
  assert.ok(parseFeedQuery({ page: '1001' }).error);
});

test('parseFeedQuery rejects an array value for q', () => {
  assert.ok(parseFeedQuery({ q: ['a', 'b'] }).error);
});

test('parseFeedQuery rejects q longer than 100 characters', () => {
  assert.ok(parseFeedQuery({ q: 'a'.repeat(101) }).error);
  assert.ok(parseFeedQuery({ q: 'a'.repeat(100) }).filters);
});
