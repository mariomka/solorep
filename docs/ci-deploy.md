# CI & Deploy

## How It Works

- `.github/workflows/deploy.yml`: push to main -> lint -> unit tests -> e2e -> Pages build -> GitHub Pages deploy (source "GitHub Actions").
- The Pages build passes `--base=/<repo-name>/` through `bun run build --` so asset URLs work under the Pages subpath.
- PWA via vite-plugin-pwa: autoUpdate registration, precache. Manifest icons are placeholder black squares (real icon pending).

## Gotchas

- STEP ORDER IS LOAD-BEARING: the e2e webServer rebuilds `dist/` with base `/`. The `--base=/<repo>/` build must run AFTER `bun run e2e`, or the deployed bundle ships wrong asset paths.
- Playwright browsers are cached at `~/.cache/ms-playwright` keyed by the bun.lock hash; the Linux install step needs `--with-deps`.
- `server.allowedHosts` in `vite.config.ts` whitelists `.trycloudflare.com` / `.ngrok-free.app` -- dev-only phone testing through tunnels, keep it.
- Phone-testing workflow: `bun run dev` + `cloudflared tunnel --url http://127.0.0.1:5173`. Use explicit `127.0.0.1`: `localhost` can resolve to IPv6 `::1` where another project's Vite may be listening.
- Exercise GIFs come from the hasaneyldrm/exercises-dataset GitHub repo; the routine `media` field is that dataset's exercise id (see `SCHEMA.md`).
