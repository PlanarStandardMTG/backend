# API Endpoints Reference

Complete reference of all available API endpoints in the PlanarStandardMTG backend.

## Authentication Endpoints (`/api/auth`)

### Register
- **Endpoint:** `POST /api/auth/register`
- **Protection:** None (public)
- **Description:** Create a new user account
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "username": "playerName",
    "password": "securePassword"
  }
  ```
- **Response:** User object with JWT token

### Login
- **Endpoint:** `POST /api/auth/login`
- **Protection:** None (public)
- **Description:** Authenticate and receive JWT token
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword"
  }
  ```
- **Response:** User object with JWT token

### Delete Account
- **Endpoint:** `DELETE /api/auth/delete`
- **Protection:** Protected (requires authentication)
- **Description:** Permanently delete the authenticated user's account. If the user has a RankedUserInfo connected to Challonge, the ChallongeConnection is deleted and the RankedUserInfo is decoupled from the user and connection.
- **Request Body:** None
- **Response:** 204 No Content on success

## User Endpoints (`/api/users`)

### Get Current User
- **Endpoint:** `GET /api/users/me`
- **Protection:** Protected (requires authentication)
- **Description:** Retrieve the profile of the authenticated user, including current ELO (merged from rankedInfo)
- **Response:** User object with `id`, `username`, `email`, `elo`, `rankedInfo`, etc.

### Lookup User by ID
- **Endpoint:** `GET /api/users/:id`
- **Protection:** Protected (requires authentication)
- **Description:** Given a user ID, return the username along with their `rankedInfo` ID and current ELO. Useful for resolving opponents in client applications.
- **Response:**
  ```json
  {
    "username": "playerName",
    "rankedInfoId": "ranked_info_id_or_null",
    "elo": 1000
  }
  ```

## Match Endpoints (`/api/matches`)

### Get All Matches
- **Endpoint:** `GET /api/matches`
- **Protection:** Protected (requires admin privileges)
- **Description:** Get all matches in the system with pagination. Matches reference `RankedUserInfo` records (not raw user IDs).
- **Query Parameters:**
  - `limit` (number, default: 10, max: 100) - Number of matches to return
  - `offset` (number, default: 0) - Pagination offset
- **Response:**
  ```json
  {
    "matches": [
      {
        "id": "match_id",
        "player1RankedId": "ranked_id_1",
        "player2RankedId": "ranked_id_2",
        "winnerRankedId": "ranked_id_1",
        "player1EloChange": 16,
        "player2EloChange": -16,
        "createdAt": "2026-01-20T...",
        "completedAt": "2026-01-20T...",
        "player1Ranked": { "id": "...", "username": "...", "elo": 1616 },
        "player2Ranked": { "id": "...", "username": "...", "elo": 1584 }
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 150,
      "hasMore": true
    }
  }
  ```

### Create Match
- **Endpoint:** `POST /api/matches`
- **Protection:** Protected (requires admin privileges)
- **Description:** Create a new ranked match between two users. User IDs are accepted in the request; the server will resolve (or create) corresponding `RankedUserInfo` records. Newly-created matches are never completed; use the complete endpoint to record results.
- **Request Body:**
  ```json
  {
    "player1Id": "user_id_1",
    "player2Id": "user_id_2"
  }
  ```
- **Validations:**
  - Both users must exist
  - Cannot create match against yourself
- **Response:** Match object including linked ranked player info. Response will include `draw: false`, `winnerRankedId: null`, and no scores.

### Complete Match
- **Endpoint:** `POST /api/matches/:matchId/complete`
- **Protection:** Protected (requires admin privileges)
- **Description:** Finalize a match by specifying the winner or marking it a draw. Scores may also be provided for record‑keeping. ELO ratings are updated accordingly.
- **Request Body:**
  ```json
  {
    // one of the two fields below must be present
    "winnerId": "ranked_id_of_winner",
    "draw": true,

    // optional numerical scores (e.g. 3-2)
    "player1Score": 3,
    "player2Score": 2
  }
  ```
- **Validations:**
  - Must specify exactly one of `winnerId` or `draw`
  - Winner (if provided) must be a ranked ID belonging to one of the players
- **Response:**
  ```json
  {
    "match": {
      "id": "...",
      "player1RankedId": "...",
      "player2RankedId": "...",
      "winnerRankedId": "..." | null,
      "draw": true | false,
      "player1Score": 3 | null,
      "player2Score": 2 | null,
      ...
    },
    "player1EloChange": 16,
    "player2EloChange": -16
  }
  ```

### Get Match Details
- **Endpoint:** `GET /api/matches/:matchId`
- **Protection:** Protected (requires authentication)
- **Description:** Fetch details of a specific match (ranked players)
- **Response:** Match object with ranked player information

### Get User Matches
- **Endpoint:** `GET /api/matches/user/:userId`
- **Protection:** Protected (requires authentication)
- **Description:** Get all matches associated with a user (resolved via their `RankedUserInfo`) with pagination
- **Query Parameters:**
  - `limit` (number, default: 10, max: 100) - Number of matches to return
  - `offset` (number, default: 0) - Pagination offset
- **Response:**
  ```json
  {
    "matches": [
      {
        "id": "match_id",
        "player1RankedId": "ranked_id_1",
        "player2RankedId": "ranked_id_2",
        "winnerRankedId": "ranked_id_1",
        "player1EloChange": 16,
        "player2EloChange": -16,
        "createdAt": "2026-01-20T...",
        "completedAt": "2026-01-20T...",
        "player1Ranked": { "id": "...", "username": "...", "elo": 1616 },
        "player2Ranked": { "id": "...", "username": "...", "elo": 1584 }
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 25,
      "hasMore": true
    }
  }
  ```

## Dashboard Endpoints (`/api/dashboard`)

<!-- dashboard leaderboard removed; use /api/leaderboard instead -->
- **Query Parameters:**
  - `limit` (number, default: 10) - Number of players to return
  - `offset` (number, default: 0) - Pagination offset
- **Response:** Array of users with stats (ELO, wins, losses, win rate)

### Current User Stats
- **Endpoint:** `GET /api/dashboard/stats/me`
- **Protection:** Protected (requires authentication)
- **Description:** Get statistics for the currently authenticated user
- **Response:** User stats including ELO, total matches, wins/losses, win rate, and last 10 matches

### User Stats by ID
- **Endpoint:** `GET /api/dashboard/stats/:userId`
- **Protection:** Protected (requires authentication)
- **Description:** Get statistics for a specific user
- **Response:** User stats including ELO, total matches, wins/losses, win rate, and last 10 matches

### Active Matches
- **Endpoint:** `GET /api/dashboard/matches/active`
- **Protection:** Protected (requires authentication)
- **Description:** Get all incomplete matches for the current user
- **Response:** Array of active matches with opponent information

### Match History
- **Endpoint:** `GET /api/dashboard/matches/history/:userId`
- **Protection:** Protected (requires authentication)
- **Description:** Get completed match history for a specific user
- **Query Parameters:**
  - `limit` (number, default: 10) - Number of matches to return
  - `offset` (number, default: 0) - Pagination offset
- **Response:** Array of completed matches sorted by completion date

## Admin Endpoints (`/api/admin`)

### Get All Users
- **Endpoint:** `GET /api/admin/users`
- **Protection:** Protected (requires admin privileges)
- **Description:** Get all users in the system with pagination and stats
- **Query Parameters:**
  - `limit` (number, default: 10, max: 100) - Number of users to return
  - `offset` (number, default: 0) - Pagination offset
- **Response:**
  ```json
  {
    "users": [
      {
        "id": "user_id",
        "email": "user@example.com",
        "username": "playerName",
        "elo": 1650,
        "isAdmin": false,
        "isTournamentOrganizer": false,
        "isBlogger": false,
        "createdAt": "2026-01-15T...",
        "totalMatches": 25,
        "totalWins": 15
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 100,
      "hasMore": true
    }
  }
  ```

## Leaderboard Endpoints (`/api/leaderboard`)

### Public Leaderboard
- **Endpoint:** `GET /api/leaderboard`
- **Protection:** None (public)
- **Description:** Get paginated leaderboard of all players with at least 1 match played, sorted by ELO
- **Query Parameters:**
  - `page` (number, default: 1) - Page number
  - `limit` (number, default: 50, max: 100) - Players per page
- **Response:**
  ```json
  {
    "leaderboard": [
      {
        "id": "user_id",
        "username": "playerName",
        "elo": 1650,
        "winsAsPlayer1": 5,
        "winsAsPlayer2": 3,
        "totalWins": 8,
        "totalMatches": 12
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100,
      "totalPages": 2
    }
  }
  ```

## Challonge Integration Endpoints (`/api/challonge`)

### Initiate OAuth Connection
- **Endpoint:** `GET /api/challonge/connect`
- **Protection:** Protected (requires authentication)
- **Description:** Generate authorization URL to initiate Challonge OAuth flow
- **Response:**
  ```json
  {
    "authorizationUrl": "https://api.challonge.com/oauth/authorize?client_id=...",
    "state": "base64_encoded_state"
  }
  ```

### OAuth Callback
- **Endpoint:** `POST /api/challonge/callback`
- **Protection:** Protected (requires authentication)
- **Description:** Exchange authorization code for access tokens, fetch user's Challonge username, and store connection
- **Request Body:**
  ```json
  {
    "code": "authorization_code_from_challonge",
    "state": "base64_encoded_state"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "connected": true,
    "expiresAt": "2026-01-21T12:00:00Z"
  }
  ```

### Get Connection Status
- **Endpoint:** `GET /api/challonge/status`
- **Protection:** Protected (requires authentication)
- **Description:** Check if user has an active Challonge connection
- **Response (Connected):**
  ```json
  {
    "connected": true,
    "expiresAt": "2026-01-21T12:00:00Z",
    "isExpired": false,
    "scope": "me tournaments:read tournaments:write matches:read matches:write",
    "connectedSince": "2026-01-20T10:00:00Z"
  }
  ```
- **Response (Not Connected):**
  ```json
  {
    "connected": false
  }
  ```

### Refresh Access Token
- **Endpoint:** `POST /api/challonge/refresh`
- **Protection:** Protected (requires authentication)
- **Description:** Manually refresh the Challonge access token using refresh token
- **Response:**
  ```json
  {
    "success": true,
    "expiresAt": "2026-01-21T14:00:00Z",
    "scope": "me tournaments:read tournaments:write matches:read matches:write"
  }
  ```

### Get Valid Access Token
- **Endpoint:** `GET /api/challonge/token`
- **Protection:** Protected (requires authentication)
- **Description:** Get current access token (auto-refreshes if expired or expiring within 5 minutes)
- **Response:**
  ```json
  {
    "accessToken": "challonge_access_token",
    "expiresAt": "2026-01-21T12:00:00Z"
  }
  ```

### Disconnect Challonge
- **Endpoint:** `DELETE /api/challonge/disconnect`
- **Protection:** Protected (requires authentication)
- **Description:** Revoke and remove Challonge OAuth connection
- **Response:**
  ```json
  {
    "success": true,
    "message": "Challonge connection removed"
  }
  ```

### Get All Tournaments
- **Endpoint:** `GET /api/challonge/tournaments`
- **Protection:** Protected (requires authentication)
- **Description:** Fetch all tournaments associated with the app from Challonge API (using API key) and sync to local database. All authenticated users can view these tournaments. Includes participation status for the current user.
- **Note:** Uses app's API key (not user OAuth) to fetch app-wide tournaments. Checks if user is a participant by comparing their Challonge username.
- **Response:**
  ```json
  {
    "tournaments": [
      {
        "id": "local_db_id",
        "challongeId": "challonge_tournament_id",
        "userId": null,
        "name": "Weekly Tournament #5",
        "tournamentType": "single elimination",
        "url": "weekly-tournament-5",
        "state": "pending",
        "startsAt": "2026-01-25T18:00:00Z",
        "gameName": "Magic: The Gathering",
        "participantCount": 16,
        "lastSyncedAt": "2026-01-22T10:00:00Z",
        "createdAt": "2026-01-22T10:00:00Z",
        "updatedAt": "2026-01-22T10:00:00Z",
        "isParticipant": true,
        "userChallongeUsername": "player123"
      }
    ],
    "count": 1
  }
  ```

### Get Tournament by ID
- **Endpoint:** `GET /api/challonge/tournaments/:id`
- **Protection:** Protected (requires authentication)
- **Description:** Fetch a specific tournament from Challonge API by ID (using API key) and sync to local database. Includes participation status for the current user.
- **URL Parameters:**
  - `id` (string) - Challonge tournament ID
- **Note:** Uses app's API key (not user OAuth) to fetch tournament data. Checks if user is a participant by comparing their Challonge username.
- **Response:**
  ```json
  {
    "tournament": {
      "id": "local_db_id",
      "challongeId": "challonge_tournament_id",
      "userId": null,
      "name": "Weekly Tournament #5",
      "tournamentType": "single elimination",
      "url": "weekly-tournament-5",
      "state": "pending",
      "startsAt": "2026-01-25T18:00:00Z",
      "gameName": "Magic: The Gathering",
      "participantCount": 16,
      "lastSyncedAt": "2026-01-22T10:00:00Z",
      "createdAt": "2026-01-22T10:00:00Z",
      "updatedAt": "2026-01-22T10:00:00Z",
      "isParticipant": true,
      "userChallongeUsername": "player123"
    },
    "fullData": {
      "name": "Weekly Tournament #5",
      "tournament_type": "single elimination",
      "url": "weekly-tournament-5",
      "state": "pending",
      "starts_at": "2026-01-25T18:00:00Z",
      "game_name": "Magic: The Gathering",
      "participants_count": 16,
      "description": "Tournament description...",
      "private": false,
      "group_stage_enabled": false
    }
  }
  ```

### Join Tournament
- **Endpoint:** `POST /api/challonge/tournaments/:id/join`
- **Protection:** Protected (requires authentication + Challonge connection)
- **Description:** Join a tournament as a participant. User must have connected their Challonge account.
- **URL Parameters:**
  - `id` (string) - Challonge tournament ID
- **Validations:**
  - User must have a Challonge connection with username
  - User cannot already be a participant
- **Note:** Uses participant caching (5-minute TTL) to minimize API calls. Cache is invalidated after successful join.
- **Response:**
  ```json
  {
    "success": true,
    "message": "Successfully joined tournament",
    "participant": {
      "id": "participant_id",
      "type": "participant",
      "attributes": {
        "name": "player123",
        "username": "player123",
        "seed": 1
      }
    }
  }
  ```
- **Error Responses:**
  - `403` - No Challonge connection found
  - `400` - Already a participant in tournament

### Leave Tournament
- **Endpoint:** `DELETE /api/challonge/tournaments/:id/leave`
- **Protection:** Protected (requires authentication + Challonge connection)
- **Description:** Leave a tournament by removing your participant entry
- **URL Parameters:**
  - `id` (string) - Challonge tournament ID
- **Validations:**
  - User must have a Challonge connection
  - User must be a participant in the tournament
- **Note:** Uses participant caching (5-minute TTL) to minimize API calls. Cache is invalidated after successful removal.
- **Response:**
  ```json
  {
    "success": true,
    "message": "Successfully left tournament"
  }
  ```
- **Error Responses:**
  - `403` - No Challonge connection found
  - `404` - Not a participant in tournament

## Quick Reference

```
Authentication:
  POST   /api/auth/register           - Create account
  POST   /api/auth/login              - Login

Matches:
  GET    /api/matches                    - Get all matches (admin only)
  POST   /api/matches                    - Create match (admin only)
  POST   /api/matches/:matchId/complete  - Complete match (admin only)
  GET    /api/matches/:matchId           - Get match details (protected)
  GET    /api/matches/user/:userId       - Get user matches (protected)

Dashboard:
  <!-- leaderboard endpoint removed, see /api/leaderboard -->
  GET    /api/dashboard/stats/me                 - Current user stats (protected)
  GET    /api/dashboard/stats/:userId            - Specific user stats (protected)
  GET    /api/dashboard/matches/active           - Active matches (protected)
  GET    /api/dashboard/matches/history/:userId  - Match history (protected)

Leaderboard:
  GET    /api/leaderboard                        - Public leaderboard (public)

Admin:
  GET    /api/admin/users                        - Get all users (admin only)

Challonge:
  GET    /api/challonge/connect                  - Initiate OAuth (protected)
  POST   /api/challonge/callback                 - OAuth callback (protected)
  GET    /api/challonge/status                   - Connection status (protected)
  POST   /api/challonge/refresh                  - Refresh token (protected)
  GET    /api/challonge/token                    - Get valid token (protected)
  DELETE /api/challonge/disconnect               - Disconnect (protected)
  GET    /api/challonge/tournaments              - Get all tournaments (protected)
  GET    /api/challonge/tournaments/:id          - Get tournament by ID (protected)
  POST   /api/challonge/tournaments/:id/join     - Join tournament (protected, requires connection)
  DELETE /api/challonge/tournaments/:id/leave    - Leave tournament (protected, requires connection)
```
## Admin Endpoints

### Sync Tournament Matches
- **Endpoint:** POST /api/admin/tournaments/sync-matches
- **Protection:** Protected (admin only)
- **Description:** Finds all tournaments whose 
atingsUpdated flag is false, fetches match data from Challonge in start-date order, creates corresponding matches in the database (only when both participants have claimed accounts), and marks the tournament as processed. Also creates  unclaimed ChallongeConnection records for any participants without an existing connection.
- **Response:**
  `json
  { \success\: true, \processed\: 3 }
  `
