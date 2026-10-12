# CLAUDE.md

The Planar Standard event manager's API. `event-manager-plan.md` is the design and `backlog.md` the
work; read the plan section a story touches before writing code.

- `src/core` is pure: no database, HTTP, clock or `Math.random` — randomness comes in as a seed.
  Business logic belongs there, not in a route.
- Standings are derived from matches on every read, never stored.
- planarstandard.com (the `PlanarStandard` repo) owns identity, formats, decks and ratings. Its rules
  hold for anything that crosses over: handles not people, pairings never inferred.
- A story's marker in `backlog.md` flips in the same commit as its work, with both tallies updated.
- `legacy` is the old site's API. Nothing on `main` imports from it.

```bash
pnpm install
pnpm build    # tsc
```
