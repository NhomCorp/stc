# stc — Sổ Thu Chi AI v2

Google Apps Script (GAS) bot that records income/expenses into Google Sheets from
Telegram messages (text/photo/voice) and Gmail, using Gemini for parsing.

- `Code.gs` — main Apps Script source (Telegram webhook, Gemini, Gmail scan, Sheet I/O, reports).
- `configui.html` — configuration Web App UI (served by `doGet`).
- `appsscript.json` — Apps Script manifest (V8 runtime, timezone, Web App access).
- `Structure.md` / `rule.md` / `note.md` — architecture map, project rules, backlog.

The code runs on Google's servers, not on a local machine. This repo ships a local
toolchain for **editing, validating, and deploying** that code.

## Development environment

Requires Node.js 18+ (the Cloud Agent environment uses Node 22).

```bash
npm install        # install dev tooling (clasp + eslint)
npm run check      # syntax-check every .gs file with `node --check`
npm run lint       # ESLint with Google Apps Script globals
npm run validate   # check + lint (run this before pushing)
```

## Deploying to Apps Script (requires a Google account)

Deployment uses [clasp](https://github.com/google/clasp). These steps need Google
auth and your own Apps Script project, so they cannot run unattended in CI:

```bash
npx clasp login                     # opens Google OAuth (one-time)
npx clasp clone <SCRIPT_ID>         # or create .clasp.json pointing at your script
npm run push                        # push Code.gs / configui.html / appsscript.json
npm run deploy                      # create a new Web App deployment
```

`.clasp.json` (script ID) and `.clasprc.json` (OAuth token) are git-ignored because
they are user/machine specific. Only `Code.gs`, `configui.html`, and `appsscript.json`
are pushed to the Apps Script project (see `.claspignore`).

## Runtime configuration (Script Properties)

Set these in the Apps Script project (via the config Web App or Script Properties):
`bot_token`, `admin_id`, `spreadsheet_id`, `ai_keys`, `ai_model`, `ai_prompt`,
`owner_names`, `so_ngay_quet`. See `rule.md` §3 for details.
