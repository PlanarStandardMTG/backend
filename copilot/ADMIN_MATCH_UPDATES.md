# Admin & Dashboard Endpoints – RankedUserInfo Integration Guide

## Overview

The backend has been refactored to support a new `RankedUserInfo` data model that decouples player rankings from user accounts. This enables:

- **Unclaimed tournament accounts** to track matches and ELO independently
- **Challenger connections** to maintain their own ranked stats separate from user ELO
- **Admin tournament import** from Challonge with automatic ranked record creation

This document explains what changed and how to update your React (TypeScript) frontend to use the new endpoints.

---

## 🔴 Breaking Changes & Required Frontend Updates

### 1. **No More `User.elo` – Use `rankedInfo.elo` Instead**

**Problem:** The `User` model no longer has an `elo` field. All rating data is now on `RankedUserInfo`.

**Frontend Impact:** Any code directly accessing `user.elo` will fail.

**Solution:** 
```typescript
// ❌ OLD (will break)
const playerElo = user.elo;

// ✅ NEW (correct)
const playerElo = user.rankedInfo?.elo ?? 1000;
```

**Affected User API Endpoints:**
- `GET /api/users/me` – now returns `rankedInfo` object with `elo` property
- `GET /api/dashboard/stats/:userId` – now returns stats from ranked info
- `GET /api/dashboard/stats/me` – now returns stats from ranked info
- `GET /api/dashboard/leaderboard` – removed; the public `/api/leaderboard` route should be used instead (client‑side filtering possible).

**Updated `User` Type (TypeScript):**
```typescript
interface User {
  id: string;
  username: string;
  email?: string;
  admin: boolean;
  tournamentOrganizer: boolean;
  blogger: boolean;
  rankedInfo?: {
    id: string;
    username: string | null;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
    userId: string | null;
    connectionId: string | null;
  };
}
```

---

### 2. **Dashboard Stats Now Include Opponent `elo` in Recent Matches**

**Change:** Recent match opponents now have an `elo` field from `RankedUserInfo`.

```typescript
// ✅ NEW Recent Match Structure
interface RecentMatch {
  id: string;
  opponent: {
    id: string;
    username: string;
    elo: number;  // ← NEW: always provided from rankedInfo
  };
  result: "win" | "loss";
  eloChange: number;
  completedAt: Date | null;
}
```

**Frontend Update:**
```typescript
// Display opponent ELO in match history
recentMatches.forEach(match => {
  console.log(`${match.opponent.username}: ${match.opponent.elo}`);
});
```

---

### 3. **Dashboard Leaderboard Removed (Use Public Route)**

The `/api/dashboard/leaderboard` endpoint has been eliminated because it was effectively a duplicate of the public leaderboard. Clients should now query `/api/leaderboard` for the same data and perform any additional filtering or ranking client‑side as needed.

> The public endpoint already returns only ranked users with completed matches and includes pagination metadata.

**Frontend Impact:**
- No longer shows users with 0 matches
- IDs are now `RankedUserInfo.id` (not `User.id`)
- Ranking is based on active tournament players only

**Updated Query:**
```typescript
// ✅ Leaderboard fetch from the public endpoint
const response = await fetch('/api/leaderboard?page=1&limit=100');
const { leaderboard } = await response.json();

leaderboard.forEach(entry => {
  console.log(`${entry.username}: ${entry.elo} ELO`);
});
```

---

## ✅ New Endpoints

### `POST /api/admin/tournaments/sync-matches`

**Purpose:** Synchronize matches from Challonge tournaments and create/update ranked records for all participants.

**Authentication:** Admin only (`onRequest: [app.authenticateAdmin]`)

**Query Parameters:** None

**Request Body:** Empty

**Response:**
```typescript
{
  success: boolean;
  processed: number;  // Number of tournaments processed
}
```

**Behavior:**
1. Finds all tournaments with `ratingsUpdated = false`
2. Fetches participants from Challonge API
3. **Creates unclaimed `ChallongeConnection` records** for participants not yet in the system
4. **Creates/reuses `RankedUserInfo` records** for each participant (linked to connection if available)
5. Fetches matches from Challonge and creates `Match` records with:
   - `player1RankedId` / `player2RankedId` (from unclaimed accounts)
   - `winnerRankedId` (the ranked user who won)
   - ELO changes calculated and applied to `RankedUserInfo`
6. Marks tournament as `ratingsUpdated = true`

**Frontend Usage:**

```typescript
async function syncTournamentMatches() {
  try {
    const response = await fetch(
      '/api/admin/tournaments/sync-matches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Sync failed:', error.message);
      return;
    }

    const result = await response.json();
    console.log(`Synced ${result.processed} tournaments`);
    toast.success(`Successfully synced matches from ${result.processed} tournament(s)`);
  } catch (error) {
    console.error('Error syncing matches:', error);
    toast.error('Failed to sync tournament matches');
  }
}
```

---

## 📋 Updated Endpoint Summaries

### Admin Users Endpoint
**`GET /api/admin/users?limit=50&offset=0`**

**Changes:**
- User objects now include ranked info in response
- ELO is pulled from `rankedInfo.elo`
- Default ELO is `0` if no ranked record exists (not `user.elo`)

**Response:**
```typescript
{
  users: Array<{
    id: string;
    email: string;
    username: string;
    elo: number;                  // ← From rankedInfo or 0
    isAdmin: boolean;
    isTournamentOrganizer: boolean;
    isBlogger: boolean;
    createdAt: Date;
    totalMatches: number;
    totalWins: number;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

---

### Dashboard Stats Endpoints
**`GET /api/dashboard/stats/:userId`** & **`GET /api/dashboard/stats/me`**

**Changes:**
- ELO defaults to `1000` if no ranked record exists
- Fetches matches via ranked ID when available
- Opponent info includes ranked ELO

**Response Structure:**
```typescript
{
  id: string;
  username: string;
  email: string;
  elo: number;                    // ← 1000 default, from rankedInfo
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: Array<{
    id: string;
    opponent: {
      id: string;
      username: string;
      elo: number;                // ← From rankedInfo
    };
    result: "win" | "loss";
    eloChange: number;
    completedAt: Date | null;
  }>;
}
```

---

### Dashboard Active Matches & History
**`GET /api/dashboard/matches/active`** & **`GET /api/dashboard/matches/history/:userId`**

**Changes:**
- Now filters matches by `rankedInfoId` when available
- Falls back to legacy `userId` for backwards compatibility

**Usage Same As Before:**
```typescript
// Fetch active matches
const active = await fetch('/api/dashboard/matches/active');
const matches = await active.json();

// Fetch history for a user
const history = await fetch('/api/dashboard/matches/history/:userId?limit=50&offset=0');
const historyMatches = await history.json();
```

---

## 🔄 Unclaimed Account Workflow

When syncing matches from Challonge, the system now handles unclaimed accounts:

```
Challonge Participant
    ↓
    Create ChallongeConnection (if doesn't exist)
    ↓
    Create RankedUserInfo (linked to connection)
    ↓
    Create Match records with ranked IDs
    ↓
    Update ELO on RankedUserInfo
```

**Frontend Implications:**
- Some tournament results may show players with no linked user account
- These accounts still have ELO and can be looked up via `RankedUserInfo.id`
- If a Challonge user later registers, their account can be connected and claimed

---

## 💡 Migration Checklist for Frontend

- [ ] Replace all `user.elo` with `user.rankedInfo?.elo ?? 1000`
- [ ] Update leaderboard to use `RankedUserInfo` structure
- [ ] Update stats displays to pull ELO from ranked info
- [ ] Add admin button to trigger `POST /api/admin/tournaments/sync-matches`
- [ ] Update TypeScript types/interfaces to match new `rankedInfo` structure
- [ ] Test user profile pages (should now show ranked ELO, not user ELO)
- [ ] Test leaderboard (should only show users with matches played)
- [ ] Test match history (should include ranked opponents with ELO)
- [ ] Test admin sync endpoint (verify tournaments update, matches are created)

---

## 🐛 Debugging / Troubleshooting

**Problem:** Stats/leaderboard showing `elo: 0` or missing elo field

**Solution:** Check if user has a `rankedInfo` record:
```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { rankedInfo: true }
});
console.log(user.rankedInfo);  // Should not be null
```

If null, create one:
```typescript
import { getOrCreateRankedForUser } from './utils/ranked.js';
await getOrCreateRankedForUser(userId);
```

---

**Problem:** Sync endpoint returns success but matches not created

**Solution:**  
- Verify tournament has `ratingsUpdated = false`
- Check that participants exist in Challonge with valid usernames
- Verify Challonge API credentials are valid (`CHALLONGE_CONFIG.apiKey`)

---


