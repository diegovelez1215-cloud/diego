# United 2026 V2 foundation

This application is isolated from the existing V1 source under `src/`.

- `npm run dev:v2` runs the Vite application with `/v2/` as its base path.
- `npm run build:v2` emits the deployable V2 shell to `public/v2/`.
- Vercel keeps serving the existing V1 root and rewrites `/v2` and `/v2/*` to that isolated V2 shell before the V1 catch-all.

Keeping the generated shell under `public/v2/` is the smallest reversible bridge for the existing static V1 deployment: it does not move V1 files or make V1 import V2 assets.
