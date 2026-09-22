# the-daily-web

College assignment.

## Requirements

- Node.js 18 or newer

## Run

```bash
npm install
npm start
```

Then open http://localhost:8000

- `/` — the website

For dev. - `npm run dev` restarts the server when files change.

Comments need a MongoDB connection — copy `.env.example` to `.env` and fill in `MONGO_URI` first.

## Tests

```bash
npm test
```

Runs on Node's built-in test runner (`node --test`), no extra dependencies. Most tests are pure (model validation, request validation, rate-limit boundary) and always run; the one live rate-limit test that needs a real database skips itself automatically unless `MONGO_URI` is set.

## Project structure

```
the-daily-web/
├── app.js            # Express app setup (middleware, routes, error handling)
├── bin/www           # starts the HTTP server
├── config/           # db.js — Mongoose connection
├── controllers/      # request logic (e.g. homeController.js, commentController.js)
├── models/           # Mongoose schemas (e.g. Comment.js)
├── routes/           # URL → controller mapping
├── views/            # EJS templates, rendered on the server
│   └── partials/     # shared header / footer / comments widget
├── public/           # static files served as-is
│   ├── css/
│   └── js/           # vanilla client JS (e.g. comments.js)
└── test/             # node:test test suites
```

## Features

### Comments

Every article page includes a comments section (list + add-comment form) that updates via Ajax, without a full page reload.

- `GET /api/articles/:articleId/comments` — list comments for an article, newest first.
- `POST /api/articles/:articleId/comments` — add a comment: `{ guestId, authorName, text }`.
- **Guest identity**: each browser gets a random `guestId` stored in `localStorage` on first use (no login required), which identifies "the same device" for rate limiting.
- **Rate limiting**: a guest can post at most 3 comments per minute (per `guestId`). Going over that returns `429` with an explanatory message — the request is never silently dropped and never crashes the server.
- Comment text is rendered client-side with `textContent` (never `innerHTML`) to prevent XSS.

Until the real article page (home feed / article view) exists, the widget can be previewed on its own at `/dev/comments-test` — a temporary route that will be removed once it's wired into the real page.
