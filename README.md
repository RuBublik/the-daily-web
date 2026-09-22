# the-daily-web

College assignment - news website.

## Requirements

- Node.js 18 or newer
- MongoDB — either a local server or a MongoDB Atlas cluster

## Setup

```bash
./setup.sh
```

Checks your Node version, installs dependencies, and creates `.env` from
`.env.example`. Safe to re-run — it never overwrites an existing `.env`.

Then point `MONGO_URI` in `.env` at a database. Remember to include the database
name in the path, otherwise Mongoose silently uses one called `test`.

```bash
# local
MONGO_URI=mongodb://127.0.0.1:27017/the-daily-web

# Atlas
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/the-daily-web
```

### Running MongoDB locally (Dev.)

Download the MongoDB Community Server archive for your platform/arch., extract into project folder, then:

```bash
mkdir -p .mongo-data
./mongodb-macos-*/bin/mongod --dbpath .mongo-data --port 27017
```

## Run

```bash
chmod +x ./setup.sh
./setup.sh
npm start
```

Then open http://localhost:PORT — the port comes from `PORT` in `.env`.

## Project structure

```
the-daily-web/
├── app.js            # Express app setup (middleware, routes, error handling)
├── bin/www           # starts the HTTP server
├── setup.sh          # one-command development setup
├── .env.example      # template for .env (copy, then fill in)
├── config/           # database connection
├── controllers/      # request logic (e.g. homeController.js)
├── routes/           # URL → controller mapping
├── views/            # EJS templates, rendered on the server
│   └── partials/     # shared header / footer
└── public/           # static files served as-is
    └── css/
```
