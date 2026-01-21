# Challonge OAuth Integration

Complete implementation of Challonge OAuth 2.0 authentication flow for the PlanarStandardMTG backend.

## Database Schema

### ChallongeConnection Model
Stores OAuth tokens and connection information for each user:

```prisma
model ChallongeConnection {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  accessToken   String
  refreshToken  String
  expiresAt     DateTime
  scope         String?
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([userId])
}
```

**Relationship:** Each user can have zero or one Challonge connection (one-to-one).

## Environment Configuration

Add these environment variables to your `.env` file:

```env
CHALLONGE_CLIENT_ID="your_client_id_here"
CHALLONGE_CLIENT_SECRET="your_client_secret_here"
CHALLONGE_REDIRECT_URI="http://localhost:5173/challonge/callback"
```

### Getting Challonge Credentials

1. Go to Challonge Developer Portal
2. Create a new OAuth application
3. Set redirect URI to match your frontend callback route
4. Copy Client ID and Client Secret

## OAuth Flow Implementation

### 1. Initiate Connection
**Frontend calls:** `GET /api/challonge/connect`

Backend returns authorization URL with state parameter:
```json
{
  "authorizationUrl": "https://api.challonge.com/oauth/authorize?...",
  "state": "base64_encoded_user_info"
}
```

Frontend redirects user to `authorizationUrl` to grant permissions.

### 2. Handle Callback
User authorizes → Challonge redirects to frontend with `code` and `state`.

**Frontend calls:** `POST /api/challonge/callback` with:
```json
{
  "code": "authorization_code",
  "state": "state_from_connect_response"
}
```

Backend:
- Validates state matches authenticated user
- Exchanges code for access + refresh tokens
- Stores tokens in database
- Returns success confirmation

### 3. Using the Connection

#### Check Status
`GET /api/challonge/status` - Check if user has active connection

#### Get Valid Token
`GET /api/challonge/token` - Get access token (auto-refreshes if expired)

This endpoint is smart:
- Returns current token if valid
- Auto-refreshes if expired or expiring within 5 minutes
- Returns new token seamlessly

Use this when making Challonge API calls from frontend.

#### Manual Refresh
`POST /api/challonge/refresh` - Force token refresh

#### Disconnect
`DELETE /api/challonge/disconnect` - Revoke and remove connection

## Frontend Integration Example

```typescript
// 1. Initiate OAuth flow
async function connectChallonge() {
  const response = await fetch('/api/challonge/connect', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  const { authorizationUrl } = await response.json();
  
  // Redirect user to Challonge
  window.location.href = authorizationUrl;
}

// 2. Handle callback (on your callback route)
async function handleCallback(code: string, state: string) {
  await fetch('/api/challonge/callback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`
    },
    body: JSON.stringify({ code, state })
  });
  
  // Redirect to success page
  router.push('/settings/integrations');
}

// 3. Use connection
async function getChallongeToken() {
  const response = await fetch('/api/challonge/token', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  const { accessToken } = await response.json();
  return accessToken;
}

// 4. Make Challonge API calls
async function fetchTournaments() {
  const token = await getChallongeToken();
  
  const response = await fetch('https://api.challonge.com/v1/tournaments', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
}
```

## Security Features

1. **State Validation**: State parameter contains user ID and timestamp to prevent CSRF
2. **User Verification**: State is validated against authenticated user before token exchange
3. **Secure Storage**: Tokens stored in database with user relationship
4. **Auto-refresh**: Tokens automatically refreshed when expired
5. **Cascade Delete**: Connection deleted when user is deleted

## Scopes

Default scope: `me tournaments:read tournaments:write matches:read matches:write`

This allows:
- Reading user profile
- Reading tournament data
- Creating/updating tournaments
- Reading match data
- Updating match results

Adjust in [src/routes/challonge.ts](../src/routes/challonge.ts) if different permissions needed.

## API Endpoints

See [ENDPOINTS.md](ENDPOINTS.md#challonge-integration-endpoints-apichallonge) for complete endpoint documentation.

## Error Handling

All endpoints include comprehensive error handling:
- 400: Bad request (missing code, invalid state)
- 403: Forbidden (state mismatch)
- 404: Not found (no connection exists)
- 500: Server error (OAuth exchange failed, database error)

Errors are logged to console for debugging.

## Testing

1. Set up environment variables
2. Start backend: `npm run start`
3. Call connect endpoint to get authorization URL
4. Complete OAuth flow
5. Verify token stored in database
6. Test token retrieval and auto-refresh

## Migration

Migration created: `20260121012949_add_challonge_connection`

Run migration: `prisma migrate deploy` (production) or `prisma migrate dev` (development)
