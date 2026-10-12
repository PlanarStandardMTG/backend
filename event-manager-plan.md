# Planar Standard Events — Plan

**Status:** first draft, for review. Decisions marked _proposed_ are open until someone objects or
the story that needs them starts. Part VI lists the questions still to settle.
**Audience:** anyone picking up a story from `backlog.md`.
**Organising principle:** the same as the main site. Every story is small enough for one person to
finish in a sitting, and each needs only the stories it depends on.

---

## Part I — What we're building

### 1. The product

An event manager for Planar Standard. It lets an organizer run an ad hoc event from start to finish
without Challonge or melee.gg.

| Feature          | What it does                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| **Events**       | An organizer creates an event, picks its format versions, rounds and top cut      |
| **Registration** | Members sign up themselves; the organizer adds guests by name, checks in, drops   |
| **Decklists**    | Each entrant submits a list, locked once the event starts                         |
| **Swiss rounds** | Pairings generated round by round, byes, no rematches, results reported and fixed |
| **Standings**    | Match points and the usual tiebreakers, derived from the results on every read    |
| **Top cut**      | Single elimination seeded from the Swiss standings                                |
| **Results out**  | A finished event goes into planarstandard.com's results, Elo and card statistics  |

### 2. Not in scope

Payments and prizes, penalties and judge calls, team events, multi-day events, and integrations
with MTGO, Arena, Challonge or melee.gg. The main site already imports from those last two. Any of
these could come later as an epic of its own.

### 3. How it fits with planarstandard.com

The main site (the `PlanarStandard` repo) stays the system of record for people, decks, formats,
results and ratings. The event manager is a **results source**, like Challonge and melee.gg (the main
site's ADR 005). It runs the event, then hands over the finished result.

```
                 sign-in (Supabase, Discord)                 results export
planarstandard.com ───────────────────────► events UI ──► events API ──────────► planarstandard.com
   (identity, roles,                          (frontend     (backend repo,         adapter → import
    formats, decks)                            repo)         own Neon DB)          → Elo, card stats
                       ◄──────────────────────────────────────────── upcoming events (E23 schedule)
```

Three things cross the line, and nothing else does:

1. **Who someone is, coming in.** A Supabase access token issued by planarstandard.com, carrying the
   member's role.
2. **A finished event, going out.** A versioned export document read by a new adapter on the main
   site.
3. **What's coming up, going out.** The public event list, read as a third source by the main site's
   upcoming-events schedule (its E23).

This changes something the main site's E23 deliberately left out: it says the platforms run events
and the site only advertises them, so there is no join. Events run here have a join. Events on
Challonge and melee.gg still work the way E23 describes.

---

## Part II — Repositories and deploys

### 4. Three repos, three Vercel projects

| Repo                               | Role                          | Deployed at (today)                   | Proposed domain                 |
| ---------------------------------- | ----------------------------- | ------------------------------------- | ------------------------------- |
| `PlanarStandardMTG/backend`        | Events API, its own Neon DB   | `planarstandardmtgbackend.vercel.app` | `events-api.planarstandard.com` |
| `PlanarStandardMTG/frontend`       | Events UI, a Vite + React SPA | `planarstandardmtg.vercel.app`        | `events.planarstandard.com`     |
| `PlanarStandardMTG/PlanarStandard` | The main site                 | `www.planarstandard.com`              | —                               |

The old site's code is on each repo's `legacy` branch. Each repo's `main` was reset with an ordinary
commit (no force-push), so its history is intact.

The repo names `backend` and `frontend` no longer say what the repos are. Renaming them on GitHub
(e.g. `events-api`, `events-web`) is safe: GitHub redirects the old URLs and Vercel follows the rename.

### 5. Environment

| Where | Variable                                      | Notes                                                   |
| ----- | --------------------------------------------- | ------------------------------------------------------- |
| API   | `DATABASE_URL`                                | Already set by the Neon integration                     |
| API   | `FRONTEND_URL`                                | Extra CORS origins, comma-separated (`api/health.ts`)   |
| API   | `SUPABASE_URL`                                | planarstandard.com's project, to fetch its JWKS (EM2.2) |
| API   | `EXPORT_TOKEN`                                | Shared with the main site, which reads exports (EM10.1) |
| UI    | `VITE_API_URL`                                | The events API                                          |
| UI    | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The main site's public values (EM2.3)                   |
| API   | ~~`JWT_SECRET`, `CHALLONGE_*`~~               | The old site's; delete them (EM1.6)                     |

The Neon database still holds the old site's tables, including members' emails and bcrypt password
hashes. EM1.5 backs it up and drops it before the first migration. Its owner must sign off on that.

---

## Part III — Architecture

### 6. The API: dependencies point inward

```
api/  (Vercel entry)  ──►  src/http  ──►  src/db  ──►  src/core
                                 └───────────────────────►┘
```

- **`src/core`** — pure functions: pairing, byes, standings, tiebreakers, the top-cut bracket and the
  event state machine. No database, no HTTP, no clock, no `Math.random`. Randomness comes in as a
  seed. Its tests need no credentials, as in the main site's `packages/core`.
- **`src/db`** — the schema, numbered migrations, and one repo module per table group. Each repo has
  narrow functions (`listEntrants(eventId)`, not `query`), and no SQL leaves the module.
- **`src/http`** — routes. Each one is a thin coordinator: authorize, load through the repos, call
  core, write through the repos. Business logic in a route is in the wrong place.
- **`api/`** — the Vercel function entry, which hands the request to `src/http`.

`.dependency-cruiser.cjs` enforces this, the way it does on the main site (EM1.2).

### 7. Stack (proposed)

| Concern  | Choice                                        | Why                                                                               |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| HTTP     | Hono on Vercel Functions                      | Web-standard `Request`/`Response`; no `server.emit` shim like the old Fastify one |
| Database | Neon Postgres, `@neondatabase/serverless`     | Already provisioned and wired to the Vercel project                               |
| Schema   | Drizzle, with SQL migrations committed        | Typed queries without Prisma's generate step and engine                           |
| Tests    | Vitest                                        | Same as the main site                                                             |
| UI       | Vite, React 19, Tailwind 4, React Router      | Kept from the old frontend's config                                               |
| Tooling  | pnpm 12, Node 24, ESLint, Prettier, strict TS | Same as the main site, so a contributor moves between the repos without friction  |

### 8. Auth

planarstandard.com's Supabase project is the only identity provider (EM-ADR 1). The events UI signs
in through it with Discord, using the main site's public URL and anon key. It sends the access token
as a bearer token. The API checks the token against the project's JWKS.

A member's role lives in the main site's `profiles` table, not in the token. EM2.1 adds a Supabase
custom access token hook that copies the role into a `user_role` claim. That is a migration on the
main site, and it needs the usual production authorization. Until it lands, the API treats everyone
as a member, so nobody can create an event.

| Who                                | May                                                                   |
| ---------------------------------- | --------------------------------------------------------------------- |
| Anyone                             | See published events, entrants, pairings, standings                   |
| A signed-in member                 | Register for an open event, submit a decklist, report their own match |
| The event's organizer, or an admin | Everything about that event                                           |
| An `organizer` or `admin` role     | Create an event                                                       |

### 9. Data model (sketch)

```
events      id, organizer_id (Supabase user id), name, description, starts_at, location,
            format_version_ids text[]  -- the main site's ids, no FK (different database)
            swiss_rounds, top_cut (0|2|4|8), state, rng_seed, created_at, updated_at
entrants    id, event_id, profile_id (nullable: a guest), display_name, handle,
            decklist_text, decklist_locked_at, checked_in_at, dropped_after_round
rounds      id, event_id, number, kind (swiss|elimination), paired_at, completed_at
matches     id, round_id, table_number, p1_entrant_id, p2_entrant_id (null = bye),
            p1_games, p2_games, game_draws, result, reported_by, confirmed_at
result_log  id, match_id, before jsonb, after jsonb, by, at  -- every change to a reported result
```

Standings are not a table (EM-ADR 3).

### 10. An event's life

```
draft ──► registration ──► running ──► top_cut ──► finished
  └──────────┴────────────────┴────────────┴──────► cancelled
```

`core/event-state` is the one place that says which transition is allowed and what each requires.
For example, `running` needs at least two checked-in entrants, and `finished` needs every match
reported.

### 11. Pairings and standings

Based on the Magic Tournament Rules; `core` cites the section for each rule.

- **Points:** win 3, draw 1, loss 0. A bye is a 2–0 win.
- **Tiebreakers:** opponents' match-win %, game-win %, opponents' game-win %. Each percentage has a
  floor of 33%, and byes don't count as opponents.
- **Round 1** is random from the event's stored seed, so a re-pair is reproducible (EM-ADR 4).
- **Later rounds** pair within point groups, top down. They pair down when a group is odd and never
  repeat a pairing. When no rematch-free pairing exists, they say so, and the organizer decides.
- **The bye** goes to the lowest-ranked entrant who has not had one.
- **Round count** is suggested from the number of entrants, and the organizer can override it.
- **Top cut** is single elimination, seeded 1 v 8, 4 v 5 and so on from the final Swiss standings.

### 12. Results into planarstandard.com

`GET /api/events/:id/export` returns one versioned document:

```json
{
  "adapter": "planar-events",
  "version": 1,
  "event": {},
  "entrants": [],
  "matches": [],
  "standings": [],
  "decklists": []
}
```

A new adapter on the main site, `planar-events-api`, turns it into a `ParsedEvent` with matches,
standings, roster and decklists. That follows the main site's rules unchanged:

- **Handles, not people** (its ADR 003). An entrant with an account goes in under their handle on the
  main site. A guest goes in as `planar-events-<entrant id>`, never as their typed name. Admins merge
  handles later, as they already do for `challonge-player-<id>`.
- **Pairings are never inferred.** The export carries real matches, so the event is rateable.
- **Re-importing supersedes.** Correcting a result after the fact means exporting again, and the main
  site replaces its copy wholesale.

The main site pulls an export when an event finishes, through the same completed-events path that
melee.gg and Challonge events take.

---

## Part IV — Decisions

| #   | Decision                                                                        |
| --- | ------------------------------------------------------------------------------- |
| 1   | planarstandard.com's Supabase is the only identity provider; no passwords here  |
| 2   | The event manager is a results source, not part of the main site's ledger       |
| 3   | Standings are derived from matches on every read, never stored or hand-edited   |
| 4   | Randomness is a seed stored on the event; core never calls `Math.random`        |
| 5   | Posted pairings are facts: a re-pair replaces the round, it never edits a match |
| 6   | Decklists lock when the event starts (the main site's ADR 013)                  |
| 7   | Format versions are the main site's ids, stored without a foreign key           |

---

## Part V — Working together

Each repo has a `CLAUDE.md` with its commands. Definition of done for a story:

- The tests for what changed pass with no credentials, unless they are `src/db` or route tests.
- CI is green: lint, dependency rules, tests and build.
- The story's marker in `backlog.md` flips in the same commit, and both tallies are updated.
- Anything that crosses into the main site (a hook, an adapter, a schedule source) is a story here
  and a story in the main site's backlog, both with the same ID.

---

## Part VI — Open questions

1. **Domains.** Are `events.planarstandard.com` and `events-api.planarstandard.com` right, or should
   the API live under the UI's domain at `/api` through a Vercel rewrite?
2. **Who reports results?** Both players with confirmation, or only the organizer? The plan assumes
   either player reports, the other confirms, and the organizer can override.
3. **Late entries and intentional draws.** Allow both? The pairing core can support them, but the UI
   doubles in places.
4. **Linking a saved deck.** Pasting text works on day one. Picking a deck saved on the main site
   needs a read endpoint there.
5. **Round timer.** Is a shared countdown wanted, or out of scope?
6. **Stack.** Hono + Drizzle is proposed in §7. Fastify + Prisma, the old stack, would also work.
