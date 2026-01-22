# PlanarStandardMTG Backend - AI Agent Instructions

## Architecture Overview

This is a **Fastify + Prisma + TypeScript** backend for an MTG tournament ELO tracking system. The app is deployed on **Vercel** using serverless functions with a **Neon PostgreSQL** database.

### Key Architecture Decisions
- **Dual-entry pattern**: [api/index.ts](api/index.ts) for Vercel serverless, exports the server from [src/server.ts](src/server.ts) which contains the app logic
- **Plugin-based Fastify**: Uses Fastify's plugin system for Prisma ([src/plugins/prisma.ts](src/plugins/prisma.ts)) and JWT auth ([src/plugins/auth.ts](src/plugins/auth.ts))
- **Neon adapter**: Uses `@prisma/adapter-neon` for serverless-compatible Prisma with connection pooling
- **TypeScript with ES modules**: Uses `"type": "module"` in package.json, `.js` extensions in imports, and `nodenext` module resolution

## Critical Patterns & Conventions

### Database & Prisma
- **Always use the exported `prisma` instance** from [src/plugins/prisma.ts](src/plugins/prisma.ts), NOT `fastify.prisma` in route handlers
- **Migration workflow**: After schema changes, run `prisma migrate dev --name <descriptive_name>` (or use the `prisma-migrate-dev` tool)
- **⚠️ CRITICAL: NEVER run `prisma migrate reset`** - This project uses the PRODUCTION database for development. Running migrate reset will DELETE ALL PRODUCTION DATA. If migration drift occurs, manually fix the drift or consult the user.
- **Schema pattern**: User model has dual Match relations (`@relation("player1")` and `@relation("player2")`) - both are required for bi-directional match tracking
- **Default ELO**: New users start at 1600 ELO (see [src/utils/elo.ts](src/utils/elo.ts))

### Authentication & Authorization
- **JWT payload structure**: `{ sub: string, email: string }` (see type declaration in [src/plugins/auth.ts](src/plugins/auth.ts))
- **Protected routes**: Use `onRequest: [app.authenticate]` (example: [src/routes/matches.ts](src/routes/matches.ts#L14-L17))
- **User extraction**: Access current user via `request.user.sub` (user ID) after authentication
- **Auth verification pattern**: Many endpoints verify users can only act on their own data (e.g., only players in a match can complete it)

### Route Patterns
- **Route registration**: All routes registered in [src/server.ts](src/server.ts) with prefixes (`/api/auth`, `/api/matches`, `/api/dashboard`)
- **Include patterns**: When fetching matches/users, consistently use `include` with `select` to control exposed fields (see [src/routes/matches.ts](src/routes/matches.ts#L49-L56))
- **Error handling**: Always wrap route logic in try/catch, return appropriate HTTP status codes (400/401/403/404/500)
- **Endpoint documentation**: Whenever you create a new endpoint, ALWAYS add it to [copilot/ENDPOINTS.md](copilot/ENDPOINTS.md) in the appropriate section with full details (method, path, protection status, description, request/response format)

### ELO System
- **Core logic**: [src/utils/elo.ts](src/utils/elo.ts) uses standard chess ELO with K-factor=32
- **Match flow**: Create match → record result → `calculateEloChange()` → update both players' ELO + store changes in Match record
- **Transaction pattern**: ELO updates use Prisma transactions to ensure atomicity (winner/loser updates happen together)

## Development Workflow

### Building & Running
```bash
npm run build      # Compiles TS + generates Prisma client
npm run start      # Runs compiled JS from dist/
```

### Database Changes
1. Edit [prisma/schema.prisma](prisma/schema.prisma)
2. Run `prisma migrate dev --name <change_description>` or use `prisma-migrate-dev` tool
3. Prisma Client auto-regenerates via postinstall hook

### CORS Configuration
- Development: `http://localhost:5173` (Vite dev server)
- Production: `https://planarstandardmtg.vercel.app`
- **Always update** [src/server.ts](src/server.ts#L12-L14) when adding new origins

## Common Gotchas

1. **Import extensions**: All local imports MUST use `.js` extension (even for `.ts` files) due to ES modules
2. **Vercel deployment**: Entry point is [api/index.ts](api/index.ts) - routes in `src/` won't be discovered automatically
3. **Prisma singleton**: Uses global caching pattern to prevent connection exhaustion in serverless
4. **Match winner validation**: Winner MUST be either `player1Id` or `player2Id` - validate in route handlers
5. **ELO change tracking**: Both `player1EloChange` and `player2EloChange` are stored on Match model - don't recalculate on fetch

## Reference Documentation
- Full ELO implementation details: [copilot/ELO_IMPLEMENTATION.md](copilot/ELO_IMPLEMENTATION.md)
- Complete API endpoint list and examples: [copilot/ENDPOINTS.md](copilot/ENDPOINTS.md)
- Prisma schema reference: [prisma/schema.prisma](prisma/schema.prisma)
- Place generated .md files in `copilot/` folder to avoid cluttering main codebase
