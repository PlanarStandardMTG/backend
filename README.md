# Planar Standard Events — API

The API behind the Planar Standard event manager: create an event, take registrations, pair Swiss
rounds, record results and hand the finished event to [planarstandard.com](https://www.planarstandard.com).

- **The plan:** [`event-manager-plan.md`](event-manager-plan.md)
- **The work:** [`backlog.md`](backlog.md), stories `EM1`–`EM10`
- **The UI:** [PlanarStandardMTG/frontend](https://github.com/PlanarStandardMTG/frontend)
- **The old site's API:** the [`legacy`](https://github.com/PlanarStandardMTG/backend/tree/legacy) branch

## Today

One endpoint, `GET /api/health`, with its CORS allow-list. A push to `main` deploys
to Vercel. A local server arrives with EM1.4.

```bash
pnpm install
pnpm build
```
