Thank you for contributing to ATSBuddy!

### Getting started

1) Fork and clone the repo
2) Create `.env.local` from `.env.example` and set required vars
3) Install deps and run dev server

```bash
npm install
npm run dev
```

### Development guidelines

- Keep edits small and focused; prefer separate PRs for unrelated changes
- TypeScript: prefer explicit types on exported APIs
- Logging: use `logger.info|warn|error` with a `requestId` when available
- Avoid adding heavy dependencies unless necessary

### Commit style

Use concise, imperative subject lines. Example: `fix: handle empty resume text`, `feat: add currency selector to metrics`.

### Testing locally

- Analyze flow: upload a small PDF/DOCX/TXT and run an analysis
- Admin: visit `/login` → enter `METRICS_PASSWORD` → `/admin/metrics` and `/admin/logs`

### Pull requests

- Include a short description, screenshots for UI changes
- Link related issues (Fixes #123)
- Ensure `npm run build` passes


