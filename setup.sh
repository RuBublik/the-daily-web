#!/usr/bin/env bash
#
# setup.sh — get a fresh clone of the-daily-web running.
#
#   ./setup.sh          install dependencies and create .env
#   ./setup.sh --help   show this message
#
# Safe to re-run. Never overwrites an existing .env.

set -euo pipefail

if [ -t 1 ]; then
  GREEN=$(printf '\033[32m'); RED=$(printf '\033[31m'); RESET=$(printf '\033[0m')
else
  GREEN=""; RED=""; RESET=""
fi

ok()  { printf '  [%sV%s] %s\n' "$GREEN" "$RESET" "$1"; }
die() { printf '\n  [%sX%s] %s\n\n' "$RED" "$RESET" "$1" >&2; exit 1; }

case "${1:-}" in
  -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "")        ;;
  *)         die "Unknown option: $1  (try --help)" ;;
esac

cd "$(dirname "$0")"
[ -f package.json ] && [ -f app.js ] || die "Run this from the-daily-web repo root."

printf '\nthe-daily-web — setup\n\n'

# Node

command -v node >/dev/null 2>&1 || die "node is not installed. Node 18+ required: https://nodejs.org"

NODE_MAJOR=$(node -v); NODE_MAJOR=${NODE_MAJOR#v}; NODE_MAJOR=${NODE_MAJOR%%.*}
[ "$NODE_MAJOR" -ge 18 ] || die "Node $(node -v) is too old — Express 5 needs Node 18 or newer."
ok "node $(node -v), npm $(npm -v)"

# Dependencies

# npm ci is reproducible, but it refuses to run when package-lock.json has drifted
# from package.json — which happens when switching between branches.
if [ -f package-lock.json ] && npm ci >/dev/null 2>&1; then
  ok "dependencies installed from package-lock.json"
else
  npm install >/dev/null
  ok "dependencies installed"
fi

# .env

if [ -f .env ]; then
  ok ".env already exists — untouched"
else
  [ -f .env.example ] || die ".env.example is missing, .env cannot be created."
  cp .env.example .env
  ok ".env created from .env.example"
fi

# Next steps

cat <<'EOF'

Next:
  1. Make sure MongoDB is reachable —
       local : ./mongodb-macos-*/bin/mongod --dbpath .mongo-data --port 27017
       Atlas : set MONGO_URI in .env
  2. npm start

EOF
