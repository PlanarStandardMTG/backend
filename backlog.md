# Planar Standard Events — Backlog

Derived from `event-manager-plan.md`. Every story is meant to be finished in one sitting by one
person, and merged as soon as its dependencies are in.

**Conventions**

- **ID** — `EM<epic>.<story>`. The `EM` prefix keeps these apart from the main site's `E` stories.
  IDs are stable; use them in branch names and commit titles, and never renumber one.
- **Repo** — `api` (this repo), `ui` (the `frontend` repo), or `site` (planarstandard.com, the
  `PlanarStandard` repo). A `site` story also gets an entry in the main site's backlog.
- **Size** — `S` ≈ under an hour · `M` ≈ a sitting · `L` ≈ split it if you can.
- **Deps** — hard blockers only.
- **Status** — ✅ done · 🚧 in progress · ⛔ blocked · ⬜ not started. A ⛔ carries a _Blocked:_ line
  naming what is needed.

A story's marker flips in the same commit as its work, with both tallies updated.

**Epic map**

| Epic | Title                           | Unblocked by | Status |
| ---- | ------------------------------- | ------------ | ------ |
| EM1  | Foundations                     | —            | 🚧 1/7 |
| EM2  | Auth                            | EM1          | ⬜ 0/4 |
| EM3  | Schema and repositories         | EM1.5        | ⬜ 0/4 |
| EM4  | Pairing and standings core      | —            | ⬜ 0/9 |
| EM5  | API: events                     | EM2, EM3     | ⬜ 0/3 |
| EM6  | API: registration               | EM5          | ⬜ 0/4 |
| EM7  | API: running an event           | EM4, EM6     | ⬜ 0/6 |
| EM8  | UI: organizer console           | EM5–EM7      | ⬜ 0/4 |
| EM9  | UI: players and spectators      | EM5–EM7      | ⬜ 0/4 |
| EM10 | Results into planarstandard.com | EM7          | ⬜ 0/4 |

---

## EM1 — Foundations

✅ **EM1.1 — Reset both repos for the event manager** · S · api, ui — the old site saved to `legacy`
in both repos. `main` keeps only what Vercel needs to build plus a health check the UI calls across
origins. _AC:_ `legacy` holds each old `main` unchanged; both `main`s build; the UI shows the API's
health.

⬜ **EM1.2 — API tooling and CI** · M · api · Deps: EM1.1 — ESLint, Prettier, Vitest,
dependency-cruiser enforcing §6 (`core` imports nothing, `db` imports only `core`), and a GitHub
Actions workflow running lint, depcruise, test and build. _AC:_ a `core` file importing `db` fails CI.

⬜ **EM1.3 — UI tooling and CI** · S · ui · Deps: EM1.1 — Prettier, Vitest with Testing Library, and a
workflow running lint, test and build.

⬜ **EM1.4 — Hono app and local dev** · M · api · Deps: EM1.2 — `src/http` as a Hono app mounted by one
catch-all Vercel function, `pnpm dev` serving it on :3000, `/api/health` kept, CORS moved into
middleware. _AC:_ the UI's health check passes against `pnpm dev` and against a preview deploy.
_Note:_ today Vercel runs each `api/*.js` as CommonJS whatever `"type": "module"` says, so ESM
output fails (`Unexpected token 'export'`) and a function importing from `src/` fails too
(`ERR_REQUIRE_ESM`). A self-contained function compiled under `nodenext` runs. Bundle the entry at
build time (e.g. tsup to one CJS file per function), or move the API to CommonJS, before anything
imports across.

⬜ **EM1.5 — Clear the legacy database and start migrations** · M · api · Deps: EM1.4 — back up the
old site's Neon tables, drop them, and set up Drizzle with a first empty migration. Local dev uses a
Neon branch or a Docker Postgres, documented in the README. _AC:_ the backup's location is written
down; no old table is left.

⬜ **EM1.6 — Retire the old project settings** · S · api, ui — delete `JWT_SECRET` and the
`CHALLONGE_*` variables from the API's Vercel project, attach the domains chosen in plan §VI.1, and
set `VITE_API_URL` and `FRONTEND_URL` to match. Done in the Vercel dashboard.

⬜ **EM1.7 — UI shell** · M · ui · Deps: EM1.3 — React Router, a header with sign-in, a footer linking
to planarstandard.com, and the main site's colour tokens and fonts, so the two sites feel like one.

## EM2 — Auth

⬜ **EM2.1 — `user_role` claim in the access token** · M · site — a Supabase custom access token hook
copying `profiles.role` into the token. _AC:_ a token issued after a role change carries the new role;
the main site's RLS tests still pass. A production migration: needs the usual authorization.

⬜ **EM2.2 — Verify tokens in the API** · M · api · Deps: EM1.4 — check bearer tokens against
`SUPABASE_URL`'s JWKS; `requireMember` and `requireRole("organizer")` middleware. _AC:_ tests sign
with a local key pair; expired, foreign-issuer and tampered tokens are refused.

⬜ **EM2.3 — Sign in from the UI** · M · ui · Deps: EM1.7 — Supabase Discord sign-in against the main
site's project, the session kept, and every API call carrying the token. _AC:_ the main site's
Supabase allows the UI's URLs as redirect targets.

⬜ **EM2.4 — "Run an event" from the main site** · S · site · Deps: EM2.3 — a link from the organizer
area of planarstandard.com to the events UI.

## EM3 — Schema and repositories

⬜ **EM3.1 — `events`** · S · api · Deps: EM1.5 — plan §9.

⬜ **EM3.2 — `entrants`** · S · api · Deps: EM3.1 — one row per member per event; guests have no
`profile_id`.

⬜ **EM3.3 — `rounds`, `matches`, `result_log`** · M · api · Deps: EM3.2 — a bye is a match with no
`p2`. _AC:_ no entrant appears twice in a round.

⬜ **EM3.4 — Repositories** · M · api · Deps: EM3.3 — `src/db/repos/{events,entrants,rounds}` with
narrow functions and tests against the local database.

## EM4 — Pairing and standings core

Pure, and testable with no credentials, so it can start today. Each module is fixture-driven:
an input and its expected output, committed side by side.

⬜ **EM4.1 — Core types** · S · api — `Entrant`, `Round`, `Match`, `MatchResult`, `Standing`, `EventState`.

⬜ **EM4.2 — `core/record`** · S · api · Deps: EM4.1 — match points and win/loss/draw from a list of
matches. A bye is a 2–0 win.

⬜ **EM4.3 — `core/tiebreakers`** · M · api · Deps: EM4.2 — OMW%, GW%, OGW%, each floored at 33%, byes
not counted as opponents. _AC:_ checked against a worked example from the Magic Tournament Rules.

⬜ **EM4.4 — `core/standings`** · S · api · Deps: EM4.3 — ordered standings; dropped entrants keep their
place in the list; exact ties broken by the seed.

⬜ **EM4.5 — `core/pair-swiss`** · L · api · Deps: EM4.4 — round 1 random from the seed; later rounds by
point group with pair-downs and no rematches. When no legal pairing exists, it says so instead of
returning a bad one. _AC:_ property test over random events: no rematch, no one paired twice.

⬜ **EM4.6 — `core/assign-bye`** · S · api · Deps: EM4.4 — the lowest-ranked entrant without a bye.

⬜ **EM4.7 — `core/suggest-rounds`** · S · api — the Swiss round count for an entrant count.

⬜ **EM4.8 — `core/top-cut`** · M · api · Deps: EM4.4 — seeding (1 v 8, 4 v 5…) and who advances.

⬜ **EM4.9 — `core/event-state`** · S · api · Deps: EM4.1 — plan §10's transitions and their
preconditions.

## EM5 — API: events

⬜ **EM5.1 — Create and edit a draft event** · M · api · Deps: EM2.2, EM3.4 — organizers and admins.
Format versions are validated against the main site's list.

⬜ **EM5.2 — List and read events** · S · api · Deps: EM3.4 — public, filtered by state.

⬜ **EM5.3 — Move an event through its states** · S · api · Deps: EM5.1, EM4.9 — refused with
`core/event-state`'s reason when not allowed.

## EM6 — API: registration

⬜ **EM6.1 — Register and withdraw** · S · api · Deps: EM5.3 — a member, while registration is open.

⬜ **EM6.2 — Guests** · S · api · Deps: EM6.1 — the organizer adds or removes an entrant by name.

⬜ **EM6.3 — Decklists** · M · api · Deps: EM6.1 — pasted text, parsed and checked by the main site's
rules later (plan §VI.4); locked when the event starts.

⬜ **EM6.4 — Check-in and drop** · S · api · Deps: EM6.1 — an entrant who drops is never paired again.

## EM7 — API: running an event

⬜ **EM7.1 — Pair the next round** · M · api · Deps: EM4.5, EM4.6, EM6.4 — persists the pairings. A
re-pair replaces an unplayed round whole.

⬜ **EM7.2 — Report a result** · M · api · Deps: EM7.1 — either player reports and the other confirms;
the organizer can enter or override. Every change is written to `result_log`.

⬜ **EM7.3 — Standings** · S · api · Deps: EM7.2, EM4.4 — derived on read, never stored.

⬜ **EM7.4 — Top cut and finish** · M · api · Deps: EM7.3, EM4.8 — bracket rounds, then `finished`.

⬜ **EM7.5 — Live updates** · S · api · Deps: EM7.2 — an `updated_at` per event, so the UI can poll cheaply.

⬜ **EM7.6 — Rate limits** · S · api · Deps: EM2.2 — on writes, per member.

## EM8 — UI: organizer console

⬜ **EM8.1 — My events and the create form** · M · ui · Deps: EM2.3, EM5.1

⬜ **EM8.2 — Entrants** · M · ui · Deps: EM8.1, EM6.4 — add guests, check in, drop.

⬜ **EM8.3 — Run the rounds** · L · ui · Deps: EM8.2, EM7.2 — pair, show pairings, enter and fix
results, advance.

⬜ **EM8.4 — Top cut** · M · ui · Deps: EM8.3, EM7.4 — the bracket and its results.

## EM9 — UI: players and spectators

⬜ **EM9.1 — Event page** · M · ui · Deps: EM5.2, EM6.1 — details, entrants, register.

⬜ **EM9.2 — Pairings and standings** · M · ui · Deps: EM7.3, EM7.5 — refreshes during a round; works
on a phone at the venue.

⬜ **EM9.3 — Report my match** · S · ui · Deps: EM7.2

⬜ **EM9.4 — Submit a decklist** · S · ui · Deps: EM6.3

## EM10 — Results into planarstandard.com

⬜ **EM10.1 — Export** · M · api · Deps: EM7.4 — plan §12's document behind `EXPORT_TOKEN`, with a
fixture committed for EM10.2 to read.

⬜ **EM10.2 — `planar-events-api` adapter** · M · site · Deps: EM10.1 — the export to a `ParsedEvent`
with matches, standings, roster and decklists. A guest is `planar-events-<id>`.

⬜ **EM10.3 — Import a finished event** · M · site · Deps: EM10.2 — through the completed-events path
melee.gg and Challonge events already take.

⬜ **EM10.4 — Upcoming events** · M · site · Deps: EM5.2 — this API as a third source in the main
site's schedule (its E23).

---

## What's ready now

- **EM4 — the pairing core.** It is pure and needs nothing else, so it can start in parallel with the
  rest. Start with EM4.1, then EM4.2–EM4.4. EM4.5 is the hard one.
- **EM1.2 and EM1.3 — tooling.** Every later API and UI story assumes them.
- **Plan §VI — open questions.** Domains (EM1.6) and who reports results (EM7.2) need settling before
  their stories start.
- **EM2.1 — the role claim.** A production migration on the main site; nothing in EM5 can be tested
  end to end with a real organizer until it lands.

## Progress

| Epic | Stories | Done |
| ---- | ------- | ---- |
| EM1  | 7       | 1    |
| EM2  | 4       | 0    |
| EM3  | 4       | 0    |
| EM4  | 9       | 0    |
| EM5  | 3       | 0    |
| EM6  | 4       | 0    |
| EM7  | 6       | 0    |
| EM8  | 4       | 0    |
| EM9  | 4       | 0    |
| EM10 | 4       | 0    |

**1 of 49 stories done across 10 epics.**
