# ATSBuddy
## AI resume + JD analyzer with built‑in metrics/logs

Upload a resume (PDF/DOCX/TXT), optionally paste a job description, and get a concise ATS‑focused analysis: score, missing keywords, bullet rewrites, ATS audit, and a cover letter scaffold. Admin pages provide token/cost metrics and rotating file logs.

## Features: 
 - resume parsing (PDF/DOCX/TXT), JD match scoring, missing keywords, bullet rewrites, ATS audit, cover letter scaffold
 - PDF inline preview on upload for quick verification (no extra deps)
- Admin: `/admin/metrics` for token/cost, `/admin/logs` with rotation and filters
- Privacy: files are not stored; work happens in‑process per request

If this project helps you, please consider starring it — it really helps!

## Quick start (2 mins)

Prereqs: Node 20+, npm

1) Copy env and set required value

```bash
cp env.example .env.local
# Required: OPENAI_API_KEY, METRICS_PASSWORD, METRICS_AUTH_SECRET
```

2) Install and run

```bash
npm install
npm run dev
```

App runs at `http://localhost:3005` (port set in `package.json`).

3) Admin access (metrics/logs)

- Go to `http://localhost:3005/login`
- Enter the password from `METRICS_PASSWORD`
- You’ll land on `/admin` (Metrics + Logs)

## Environment variables
## Required
Create `.env.local` from `env.example`.

- `OPENAI_API_KEY` (required)
- `METRICS_PASSWORD` (required)

### Optional:
- AI: `OPENAI_MODEL` (default `gpt-5-nano`), `OPENAI_SERVICE_TIER` (`flex` | `auto` | `priority`, default `flex`)
- Auth cookie: `METRICS_AUTH_SECRET` (HMAC key for admin cookie; falls back to `METRICS_PASSWORD` if unset)
- Logging: `LOG_DIR`, `LOG_FILE`, `LOG_MAX_BYTES`, `LOG_MAX_FILES`, `LOG_LEVEL`
- Metrics storage: `METRICS_DIR`

## Usage screenshots / demo

Below are temporary visuals (replace with your own screenshots or a short demo video link):

<img src="public/window.svg" alt="ATSBuddy UI" width="720" />

- Home: upload resume, optional JD, run analysis
- PDF uploads show an inline preview; TXT uploads show a short text snippet
- Results: score, missing keywords, bullet rewrites, ATS audit, cover letter scaffold
- Admin: metrics (token/cost/latency), logs (filter/search/group by request)

Demo video (replace with your link): `[Watch 2‑minute demo]`

## Deploy

- One‑click deploy to Vercel (imports your existing repo):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?repository-url=https://github.com/Kingjuli/atsbuddy&env=OPENAI_API_KEY,METRICS_PASSWORD,METRICS_AUTH_SECRET&envDescription=Set%20OpenAI%20API%20key%2C%20admin%20password%2C%20and%20METRICS_AUTH_SECRET%20(for%20cookie%20signing).&envLink=https://github.com/Kingjuli/atsbuddy/blob/master/env.example)

- After deploy, visit `/login` and use `METRICS_PASSWORD` for admin.
- Any Node host that supports Next.js 15+ works

## Production build:

```bash
npm run build && npm start
```

## Development

```bash
npm run dev      # http://localhost:3005
npm run lint     # lint
npm run build    # production build
```

## Contributing

PRs welcome! See `CONTRIBUTING.md` for setup, commit style, and how to run locally. Please also open feature requests and bug reports via the issue templates.

## License

MIT — see `LICENSE`.
