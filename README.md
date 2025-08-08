### ATSBuddy — AI resume + JD analyzer with built‑in metrics/logs

Upload a resume (PDF/DOCX/TXT), optionally paste a job description, and get a concise ATS‑focused analysis: score, missing keywords, bullet rewrites, ATS audit, and a cover letter scaffold. Admin pages provide token/cost metrics and rotating file logs out of the box.

- Features: resume parsing (PDF/DOCX/TXT), JD match scoring, missing keywords, bullet rewrites, ATS audit, cover letter scaffold
- Admin: `/admin/metrics` for token/cost, `/admin/logs` with rotation and filters
- Privacy: files are not stored; work happens in‑process per request

If this project helps you, please consider starring it — it really helps!

## Quick start

Prereqs: Node 20+, npm

1) Copy env and fill required values

```bash
cp env.example .env.local
# Set OPENAI_API_KEY and METRICS_PASSWORD at minimum
```

2) Install and run

```bash
npm install
npm run dev
```

App runs at `http://localhost:3005` (port set in `package.json`).

3) Admin access (metrics/logs)

- Visit `http://localhost:3005/login`
- Sign in with the password you set in `METRICS_PASSWORD`
- You’ll be redirected to `/admin` (Metrics + Logs)

## Environment variables
Create `.env.local` from `env.example`.

- `OPENAI_API_KEY` (required): your OpenAI API key
- `OPENAI_MODEL` (optional): default `gpt-5-nano`
- `OPENAI_SERVICE_TIER` (optional): `flex` | `auto` | `priority` (defaults to `flex`)
- `METRICS_PASSWORD` (required): password for `/login` and protected APIs
- `METRICS_AUTH_SECRET` (optional): HMAC secret for cookie auth. If omitted, `METRICS_PASSWORD` is used
- `LOG_DIR`, `LOG_FILE`, `LOG_MAX_BYTES`, `LOG_MAX_FILES`, `LOG_LEVEL` (optional): control rotating file logs
- `METRICS_DIR` (optional): directory to persist JSON metrics (`data/metrics.json` by default)

## Usage screenshots / demo

Below are temporary visuals (replace with your own screenshots or a short demo video link):

<img src="public/window.svg" alt="ATSBuddy UI" width="720" />

- Home: upload resume, optional JD, run analysis
- Results: score, missing keywords, bullet rewrites, ATS audit, cover letter scaffold
- Admin: metrics (token/cost/latency), logs (filter/search/group by request)

Demo video (replace with your link): `[Watch 2‑minute demo]`

## Deploy

- Vercel (recommended): import the repo and add the env vars above

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2F&hasTrialAvailable=1)
- Any Node host that supports Next.js 15+ works

Production build:

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
