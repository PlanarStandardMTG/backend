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

## Match Endpoints (`/api/matches`)

### Create Match
- **Endpoint:** `POST /api/matches`
- **Protection:** Protected (requires admin privileges)
- **Description:** Create a new match between two players
- **Request Body:**
  ```json
  {
    "player1Id": "user_id_1",
    "player2Id": "user_id_2"
  }
  ```
- **Validations:**
  - Both players must exist
  - Cannot create match with self
- **Response:** Match object with player details

### Complete Match
- **Endpoint:** `POST /api/matches/:matchId/complete`
- **Protection:** Protected (requires admin privileges)
- **Description:** Complete a match, record winner, and update ELO ratings
- **Request Body:**
  ```json
  {
    "winnerId": "user_id"
  }
  ```
- **Validations:**
  - Winner must be either player1 or player2
- **Response:** Updated match with ELO changes for both players

### Get Match Details
- **Endpoint:** `GET /api/matches/:matchId`
- **Protection:** Protected (requires authentication)
- **Description:** Fetch details of a specific match
- **Response:** Match object with player information

## Dashboard Endpoints (`/api/dashboard`)

### Global Leaderboard
- **Endpoint:** `GET /api/dashboard/leaderboard`
- **Protection:** Protected (requires authentication)
- **Description:** Get ranked list of all players by ELO
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

## Quick Reference

```
Authentication:
  POST   /api/auth/register           - Create account
  POST   /api/auth/login              - Login

Matches:
  POST   /api/matches                    - Create match (admin only)
  POST   /api/matches/:matchId/complete  - Complete match (admin only)
  GET    /api/matches/:matchId           - Get match details (protected)

Dashboard:
  GET    /api/dashboard/leaderboard              - Global leaderboard (protected)
  GET    /api/dashboard/stats/me                 - Current user stats (protected)
  GET    /api/dashboard/stats/:userId            - Specific user stats (protected)
  GET    /api/dashboard/matches/active           - Active matches (protected)
  GET    /api/dashboard/matches/history/:userId  - Match history (protected)

Leaderboard:
  GET    /api/leaderboard                        - Public leaderboard (public)
```
