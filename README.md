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

## Project structure

```
the-daily-web/
├── app.js            # Express app setup (middleware, routes, error handling)
├── bin/www           # starts the HTTP server
├── controllers/      # request logic (e.g. homeController.js)
├── routes/           # URL → controller mapping
├── views/            # EJS templates, rendered on the server
│   └── partials/     # shared header / footer
└── public/           # static files served as-is
    └── css/
```
