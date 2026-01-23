import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../plugins/prisma.js';

// Challonge OAuth Configuration
const CHALLONGE_CONFIG = {
  clientId: process.env.CHALLONGE_CLIENT_ID || 'YOUR_CHALLONGE_CLIENT_ID',
  clientSecret: process.env.CHALLONGE_CLIENT_SECRET || 'YOUR_CHALLONGE_CLIENT_SECRET',
  apiKey: process.env.CHALLONGE_API_KEY || 'YOUR_CHALLONGE_API_KEY',
  authorizationUrl: 'https://api.challonge.com/oauth/authorize',
  tokenUrl: 'https://api.challonge.com/oauth/token',
  redirectUri: process.env.CHALLONGE_REDIRECT_URI || 'http://localhost:5173/challonge/callback',
  scope: 'me tournaments:read tournaments:write matches:read matches:write participants:read participants:write'
};

// Cache for tournament participants to minimize API calls
interface ParticipantCacheEntry {
  data: Array<{
    id: string;
    attributes: {
      name?: string;
      username?: string;
      seed?: number;
      tournament_id?: number;
    };
  }>;
  timestamp: number;
}

const participantsCache = new Map<string, ParticipantCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedParticipants(tournamentId: string): ParticipantCacheEntry['data'] | null {
  const cached = participantsCache.get(tournamentId);
  if (!cached) return null;
  
  const isExpired = Date.now() - cached.timestamp > CACHE_TTL;
  if (isExpired) {
    participantsCache.delete(tournamentId);
    return null;
  }
  
  return cached.data;
}

function setCachedParticipants(tournamentId: string, data: ParticipantCacheEntry['data']): void {
  participantsCache.set(tournamentId, {
    data,
    timestamp: Date.now(),
  });
}

function invalidateParticipantsCache(tournamentId: string): void {
  participantsCache.delete(tournamentId);
}

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    email: string;
    admin: boolean;
    tournamentOrganizer: boolean;
    blogger: boolean;
  };
}

export default async function challongeRoutes(app: FastifyInstance) {
  // Get authorization URL to initiate OAuth flow
  app.get('/connect', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const state = Buffer.from(JSON.stringify({
          userId: request.user.sub,
          timestamp: Date.now()
        })).toString('base64');

        const authUrl = new URL(CHALLONGE_CONFIG.authorizationUrl);
        authUrl.searchParams.append('client_id', CHALLONGE_CONFIG.clientId);
        authUrl.searchParams.append('redirect_uri', CHALLONGE_CONFIG.redirectUri);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('scope', CHALLONGE_CONFIG.scope);
        authUrl.searchParams.append('state', state);

        return reply.send({
          authorizationUrl: authUrl.toString(),
          state
        });
      } catch (error) {
        console.error('Error generating Challonge auth URL:', error);
        return reply.status(500).send({ error: 'Failed to generate authorization URL' });
      }
    }
  });

  // OAuth callback - exchange code for tokens
  app.post('/callback', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const { code, state } = request.body as { code: string; state: string };

        if (!code) {
          return reply.status(400).send({ error: 'Authorization code is required' });
        }

        // Verify state matches authenticated user
        let stateData;
        try {
          stateData = JSON.parse(Buffer.from(state, 'base64').toString());
          if (stateData.userId !== request.user.sub) {
            return reply.status(403).send({ error: 'State mismatch - invalid user' });
          }
        } catch (error) {
          return reply.status(400).send({ error: 'Invalid state parameter' });
        }

        // Exchange code for access token
        const tokenResponse = await fetch(CHALLONGE_CONFIG.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: CHALLONGE_CONFIG.clientId,
            client_secret: CHALLONGE_CONFIG.clientSecret,
            redirect_uri: CHALLONGE_CONFIG.redirectUri,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Challonge token exchange failed:', errorText);
          return reply.status(400).send({ error: 'Failed to exchange authorization code' });
        }

        const tokenData = await tokenResponse.json() as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          scope?: string;
        };

        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

        // Fetch user's Challonge username
        let challongeUsername: string | undefined;
        console.log('Attempting to fetch Challonge username...');
        console.log('Access token (first 20 chars):', tokenData.access_token.substring(0, 20));
        
        try {
          // Use Authorization-Type: v2 for OAuth2 tokens
          const meResponse = await fetch('https://api.challonge.com/v2.1/me.json', {
            headers: {
              'Authorization-Type': 'v2',
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/vnd.api+json',
              'Accept': 'application/json',
            },
          });
          
          console.log('Challonge /me.json response status:', meResponse.status);
          
          if (meResponse.ok) {
            const meData = await meResponse.json() as {
              data: {
                attributes: {
                  username?: string;
                };
              };
            };
            console.log('Challonge /me.json response data:', JSON.stringify(meData, null, 2));
            challongeUsername = meData.data.attributes.username;
            console.log('Extracted Challonge username:', challongeUsername);
          } else {
            const errorText = await meResponse.text();
            console.error('Challonge /me.json failed. Status:', meResponse.status, 'Error:', errorText);
          }
        } catch (error) {
          console.error('Exception while fetching Challonge username:', error);
        }
        
        console.log('Final challongeUsername to save:', challongeUsername);

        // Verify user exists in database before creating connection
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { id: true },
        });

        if (!user) {
          console.error('User not found in database:', request.user.sub);
          return reply.status(404).send({ 
            error: 'User account not found. Please log in again.' 
          });
        }

        // Store or update the connection
        const connection = await prisma.challongeConnection.upsert({
          where: { userId: request.user.sub },
          create: {
            userId: request.user.sub,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope || CHALLONGE_CONFIG.scope,
            challongeUsername,
          },
          update: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope || CHALLONGE_CONFIG.scope,
            challongeUsername,
          },
        });

        return reply.send({
          success: true,
          connected: true,
          expiresAt: connection.expiresAt,
        });
      } catch (error) {
        console.error('Error in Challonge callback:', error);
        return reply.status(500).send({ error: 'Failed to complete OAuth flow' });
      }
    }
  });

  // Get connection status
  app.get('/status', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const connection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
          select: {
            id: true,
            expiresAt: true,
            scope: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!connection) {
          return reply.send({
            connected: false,
          });
        }

        const isExpired = new Date() >= connection.expiresAt;

        return reply.send({
          connected: true,
          expiresAt: connection.expiresAt,
          isExpired,
          scope: connection.scope,
          connectedSince: connection.createdAt,
        });
      } catch (error) {
        console.error('Error checking Challonge status:', error);
        return reply.status(500).send({ error: 'Failed to check connection status' });
      }
    }
  });

  // Refresh access token
  app.post('/refresh', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const connection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
        });

        if (!connection) {
          return reply.status(404).send({ error: 'No Challonge connection found' });
        }

        // Request new access token using refresh token
        const tokenResponse = await fetch(CHALLONGE_CONFIG.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: connection.refreshToken,
            client_id: CHALLONGE_CONFIG.clientId,
            client_secret: CHALLONGE_CONFIG.clientSecret,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Challonge token refresh failed:', errorText);
          return reply.status(400).send({ error: 'Failed to refresh access token' });
        }

        const tokenData = await tokenResponse.json() as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope?: string;
        };

        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

        // Update the connection with new tokens
        const updatedConnection = await prisma.challongeConnection.update({
          where: { userId: request.user.sub },
          data: {
            accessToken: tokenData.access_token,
            // Some OAuth providers rotate refresh tokens, some don't
            ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token }),
            expiresAt,
            ...(tokenData.scope && { scope: tokenData.scope }),
          },
          select: {
            id: true,
            expiresAt: true,
            scope: true,
          },
        });

        return reply.send({
          success: true,
          expiresAt: updatedConnection.expiresAt,
          scope: updatedConnection.scope,
        });
      } catch (error) {
        console.error('Error refreshing Challonge token:', error);
        return reply.status(500).send({ error: 'Failed to refresh token' });
      }
    }
  });

  // Disconnect/revoke Challonge connection
  app.delete('/disconnect', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const connection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
        });

        if (!connection) {
          return reply.status(404).send({ error: 'No Challonge connection found' });
        }

        // Attempt to revoke the token with Challonge (optional - depends on their API)
        // Note: Not all OAuth providers have a revoke endpoint
        try {
          await fetch('https://api.challonge.com/oauth/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: connection.accessToken,
              client_id: CHALLONGE_CONFIG.clientId,
              client_secret: CHALLONGE_CONFIG.clientSecret,
            }),
          });
        } catch (revokeError) {
          // Log but don't fail - we'll delete locally anyway
          console.warn('Failed to revoke token with Challonge:', revokeError);
        }

        // Delete the connection from our database
        await prisma.challongeConnection.delete({
          where: { userId: request.user.sub },
        });

        return reply.send({
          success: true,
          message: 'Challonge connection removed',
        });
      } catch (error) {
        console.error('Error disconnecting Challonge:', error);
        return reply.status(500).send({ error: 'Failed to disconnect' });
      }
    }
  });

  // Get valid access token (auto-refresh if expired)
  app.get('/token', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        let connection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
        });

        if (!connection) {
          return reply.status(404).send({ error: 'No Challonge connection found' });
        }

        // Check if token is expired or will expire in the next 5 minutes
        const expiryThreshold = new Date(Date.now() + 5 * 60 * 1000);
        
        if (connection.expiresAt <= expiryThreshold) {
          // Token expired or about to expire - refresh it
          const tokenResponse = await fetch(CHALLONGE_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: connection.refreshToken,
              client_id: CHALLONGE_CONFIG.clientId,
              client_secret: CHALLONGE_CONFIG.clientSecret,
            }),
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json() as {
              access_token: string;
              refresh_token?: string;
              expires_in: number;
            };

            const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

            connection = await prisma.challongeConnection.update({
              where: { userId: request.user.sub },
              data: {
                accessToken: tokenData.access_token,
                ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token }),
                expiresAt,
              },
            });
          }
        }

        return reply.send({
          accessToken: connection.accessToken,
          expiresAt: connection.expiresAt,
        });
      } catch (error) {
        console.error('Error getting Challonge token:', error);
        return reply.status(500).send({ error: 'Failed to get access token' });
      }
    }
  });

  // ============================================
  // TOURNAMENT ROUTES
  // ============================================

  // Helper function to get a valid access token (auto-refresh if needed)
  async function getValidAccessToken(userId: string): Promise<string | null> {
    let connection = await prisma.challongeConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      return null;
    }

    // Check if token is expired or will expire in the next 5 minutes
    const expiryThreshold = new Date(Date.now() + 5 * 60 * 1000);
    
    if (connection.expiresAt <= expiryThreshold) {
      // Token expired or about to expire - refresh it
      try {
        const tokenResponse = await fetch(CHALLONGE_CONFIG.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: connection.refreshToken,
            client_id: CHALLONGE_CONFIG.clientId,
            client_secret: CHALLONGE_CONFIG.clientSecret,
          }),
        });

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
          };

          const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

          connection = await prisma.challongeConnection.update({
            where: { userId },
            data: {
              accessToken: tokenData.access_token,
              ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token }),
              expiresAt,
            },
          });
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
    }

    return connection.accessToken;
  }

  // Helper function to fetch tournament participants (with caching)
  async function fetchTournamentParticipants(tournamentId: string): Promise<ParticipantCacheEntry['data'] | null> {
    // Check cache first
    const cached = getCachedParticipants(tournamentId);
    if (cached) {
      return cached;
    }

    // Fetch from API
    try {
      const participantsResponse = await fetch(
        `https://api.challonge.com/v2.1/tournaments/${tournamentId}/participants.json`,
        {
          method: 'GET',
          headers: {
            'Authorization-Type': 'v1',
            'Authorization': CHALLONGE_CONFIG.apiKey,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/json',
          },
        }
      );

      if (!participantsResponse.ok) {
        return null;
      }

      const participantsData = await participantsResponse.json() as {
        data: ParticipantCacheEntry['data'];
      };

      // Cache the result
      setCachedParticipants(tournamentId, participantsData.data);

      return participantsData.data;
    } catch (error) {
      console.error('Error fetching participants:', error);
      return null;
    }
  }

  // Get all tournaments associated with the app (using API key)
  app.get('/tournaments', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        if (!CHALLONGE_CONFIG.apiKey || CHALLONGE_CONFIG.apiKey === 'YOUR_CHALLONGE_API_KEY') {
          return reply.status(500).send({ error: 'Challonge API key not configured' });
        }

        // Fetch tournaments from Challonge API using app's API key
        const tournamentsResponse = await fetch('https://api.challonge.com/v2.1/tournaments.json', {
          method: 'GET',
          headers: {
            'Authorization-Type': 'v1',
            'Authorization': CHALLONGE_CONFIG.apiKey,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/json',
          },
        });

        if (!tournamentsResponse.ok) {
          const errorText = await tournamentsResponse.text();
          console.error('Failed to fetch tournaments:', errorText);
          return reply.status(tournamentsResponse.status).send({ 
            error: 'Failed to fetch tournaments from Challonge' 
          });
        }

        const tournamentsData = await tournamentsResponse.json() as {
          data: Array<{
            id: string;
            type: string;
            attributes: {
              name: string;
              tournament_type: string;
              url?: string;
              state?: string;
              starts_at?: string;
              game_name?: string;
              participants_count?: number;
            };
          }>;
        };

        // Get user's Challonge connection to check participation
        const userConnection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
          select: { challongeUsername: true },
        });

        // Sync tournaments to local database and check participation
        const tournaments = await Promise.all(
          tournamentsData.data.map(async (tournament) => {
            const tournamentData = {
              challongeId: tournament.id,
              userId: null,
              name: tournament.attributes.name,
              tournamentType: tournament.attributes.tournament_type,
              url: tournament.attributes.url || null,
              state: tournament.attributes.state || null,
              startsAt: tournament.attributes.starts_at ? new Date(tournament.attributes.starts_at) : null,
              gameName: tournament.attributes.game_name || null,
              participantCount: tournament.attributes.participants_count || 0,
              lastSyncedAt: new Date(),
            };

            const savedTournament = await prisma.tournament.upsert({
              where: { challongeId: tournament.id },
              create: tournamentData,
              update: {
                name: tournament.attributes.name,
                tournamentType: tournament.attributes.tournament_type,
                url: tournament.attributes.url || null,
                state: tournament.attributes.state || null,
                startsAt: tournament.attributes.starts_at ? new Date(tournament.attributes.starts_at) : null,
                gameName: tournament.attributes.game_name || null,
                participantCount: tournament.attributes.participants_count || 0,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              },
            });

            // Check if user is a participant
            let isParticipant = false;
            let userChallongeUsername: string | null = null;
            console.log('User connection:', userConnection);

            if (userConnection?.challongeUsername) {
              console.log('Checking participation for user:', userConnection.challongeUsername);
              try {
                const participants = await fetchTournamentParticipants(tournament.id);

                if (participants) {
                  const participant = participants.find(
                    (p) => p.attributes.username === userConnection.challongeUsername ||
                           p.attributes.name === userConnection.challongeUsername
                  );

                  if (participant) {
                    isParticipant = true;
                    userChallongeUsername = userConnection.challongeUsername;
                  }
                }
              } catch (error) {
                console.warn(`Failed to fetch participants for tournament ${tournament.id}:`, error);
              }
            }

            return {
              ...savedTournament,
              isParticipant,
              userChallongeUsername,
            };
          })
        );

        return reply.send({
          tournaments,
          count: tournaments.length,
        });
      } catch (error) {
        console.error('Error fetching tournaments:', error);
        return reply.status(500).send({ error: 'Failed to fetch tournaments' });
      }
    }
  });

  // Get a specific tournament by ID
  app.get('/tournaments/:id', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const { id } = request.params as { id: string };

        if (!CHALLONGE_CONFIG.apiKey || CHALLONGE_CONFIG.apiKey === 'YOUR_CHALLONGE_API_KEY') {
          return reply.status(500).send({ error: 'Challonge API key not configured' });
        }

        // Fetch tournament from Challonge API using app's API key
        const tournamentResponse = await fetch(`https://api.challonge.com/v2.1/tournaments/${id}.json`, {
          method: 'GET',
          headers: {
            'Authorization-Type': 'v1',
            'Authorization': CHALLONGE_CONFIG.apiKey,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/json',
          },
        });

        if (!tournamentResponse.ok) {
          if (tournamentResponse.status === 404) {
            return reply.status(404).send({ error: 'Tournament not found' });
          }
          const errorText = await tournamentResponse.text();
          console.error('Failed to fetch tournament:', errorText);
          return reply.status(tournamentResponse.status).send({ 
            error: 'Failed to fetch tournament from Challonge' 
          });
        }

        const tournamentData = await tournamentResponse.json() as {
          data: {
            id: string;
            type: string;
            attributes: {
              name: string;
              tournament_type: string;
              url?: string;
              state?: string;
              starts_at?: string;
              game_name?: string;
              participants_count?: number;
              description?: string;
              private?: boolean;
              group_stage_enabled?: boolean;
            };
          };
        };

        const tournament = tournamentData.data;

        // Sync tournament to local database (app-wide, no userId)
        const localTournament = await prisma.tournament.upsert({
          where: { challongeId: tournament.id },
          create: {
            challongeId: tournament.id,
            userId: null,
            name: tournament.attributes.name,
            tournamentType: tournament.attributes.tournament_type,
            url: tournament.attributes.url || null,
            state: tournament.attributes.state || null,
            startsAt: tournament.attributes.starts_at ? new Date(tournament.attributes.starts_at) : null,
            gameName: tournament.attributes.game_name || null,
            participantCount: tournament.attributes.participants_count || 0,
            lastSyncedAt: new Date(),
          },
          update: {
            name: tournament.attributes.name,
            tournamentType: tournament.attributes.tournament_type,
            url: tournament.attributes.url || null,
            state: tournament.attributes.state || null,
            startsAt: tournament.attributes.starts_at ? new Date(tournament.attributes.starts_at) : null,
            gameName: tournament.attributes.game_name || null,
            participantCount: tournament.attributes.participants_count || 0,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Check if user is a participant
        let isParticipant = false;
        let userChallongeUsername: string | null = null;

        const userConnection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
          select: { challongeUsername: true },
        });

        if (userConnection?.challongeUsername) {
          try {
            const participants = await fetchTournamentParticipants(tournament.id);

            if (participants) {
              const participant = participants.find(
                (p) => p.attributes.username === userConnection.challongeUsername ||
                       p.attributes.name === userConnection.challongeUsername
              );

              if (participant) {
                isParticipant = true;
                userChallongeUsername = userConnection.challongeUsername;
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch participants for tournament ${tournament.id}:`, error);
          }
        }

        return reply.send({
          tournament: {
            ...localTournament,
            isParticipant,
            userChallongeUsername,
          },
          fullData: tournament.attributes,
        });
      } catch (error) {
        console.error('Error fetching tournament:', error);
        return reply.status(500).send({ error: 'Failed to fetch tournament' });
      }
    }
  });

  // Join a tournament as a participant
  app.post('/tournaments/:id/join', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const { id } = request.params as { id: string };

        // Fetch tournament from database to get challongeId
        const tournament = await prisma.tournament.findUnique({
          where: { id },
          select: { challongeId: true, url: true },
        });

        if (!tournament) {
          return reply.status(404).send({ error: 'Tournament not found' });
        }

        const tournamentIdentifier = tournament.challongeId;

        // Check if user has connected their Challonge account
        const userConnection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
          select: { challongeUsername: true },
        });

        if (!userConnection?.challongeUsername) {
          return reply.status(403).send({ 
            error: 'You must connect your Challonge account before joining tournaments' 
          });
        }

        // Check if user is already a participant (use cache)
        const participants = await fetchTournamentParticipants(tournamentIdentifier);
        
        if (participants) {
          const alreadyParticipant = participants.find(
            (p) => p.attributes.username === userConnection.challongeUsername ||
                   p.attributes.name === userConnection.challongeUsername
          );

          if (alreadyParticipant) {
            return reply.status(400).send({ 
              error: 'You are already a participant in this tournament' 
            });
          }
        }

        if (!CHALLONGE_CONFIG.apiKey || CHALLONGE_CONFIG.apiKey === 'YOUR_CHALLONGE_API_KEY') {
          return reply.status(500).send({ error: 'Challonge API key not configured' });
        }

        // Create participant using Challonge API
        const createParticipantResponse = await fetch(
          `https://api.challonge.com/v2.1/tournaments/${tournamentIdentifier}/participants.json`,
          {
            method: 'POST',
            headers: {
              'Authorization-Type': 'v1',
              'Authorization': CHALLONGE_CONFIG.apiKey,
              'Content-Type': 'application/vnd.api+json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              data: {
                type: 'Participants',
                attributes: {
                  name: userConnection.challongeUsername,
                  username: userConnection.challongeUsername,
                },
              },
            }),
          }
        );

        if (!createParticipantResponse.ok) {
          const errorText = await createParticipantResponse.text();
          console.error('Failed to create participant:', errorText);
          return reply.status(createParticipantResponse.status).send({ 
            error: 'Failed to join tournament' 
          });
        }

        const participantData = await createParticipantResponse.json() as {
          data: {
            id: string;
            type: string;
            attributes: {
              name: string;
              username?: string;
              seed?: number;
            };
          };
        };

        // Invalidate cache for this tournament
        invalidateParticipantsCache(tournamentIdentifier);

        // Update tournament participant count in local DB
        const updatedTournament = await prisma.tournament.findUnique({
          where: { id },
        });

        if (updatedTournament) {
          await prisma.tournament.update({
            where: { id },
            data: {
              participantCount: updatedTournament.participantCount + 1,
              lastSyncedAt: new Date(),
            },
          });
        }

        return reply.send({
          success: true,
          message: 'Successfully joined tournament',
          participant: participantData.data,
        });
      } catch (error) {
        console.error('Error joining tournament:', error);
        return reply.status(500).send({ error: 'Failed to join tournament' });
      }
    }
  });

  // Leave a tournament (remove participant)
  app.delete('/tournaments/:id/leave', {
    onRequest: [app.authenticate],
    handler: async (request: AuthenticatedRequest, reply) => {
      try {
        const { id } = request.params as { id: string };

        // Fetch tournament from database to get challongeId
        const tournament = await prisma.tournament.findUnique({
          where: { id },
          select: { challongeId: true, url: true },
        });

        if (!tournament) {
          return reply.status(404).send({ error: 'Tournament not found' });
        }

        const tournamentIdentifier = tournament.challongeId;

        // Check if user has connected their Challonge account
        const userConnection = await prisma.challongeConnection.findUnique({
          where: { userId: request.user.sub },
          select: { challongeUsername: true },
        });

        if (!userConnection?.challongeUsername) {
          return reply.status(403).send({ 
            error: 'You must have a Challonge account connected' 
          });
        }

        // Find the user's participant entry in the tournament
        const participants = await fetchTournamentParticipants(tournamentIdentifier);
        
        if (!participants) {
          return reply.status(500).send({ error: 'Failed to fetch tournament participants' });
        }

        const userParticipant = participants.find(
          (p) => p.attributes.username === userConnection.challongeUsername ||
                 p.attributes.name === userConnection.challongeUsername
        );

        if (!userParticipant) {
          return reply.status(404).send({ 
            error: 'You are not a participant in this tournament' 
          });
        }

        if (!CHALLONGE_CONFIG.apiKey || CHALLONGE_CONFIG.apiKey === 'YOUR_CHALLONGE_API_KEY') {
          return reply.status(500).send({ error: 'Challonge API key not configured' });
        }

        // Delete participant using Challonge API
        const deleteParticipantResponse = await fetch(
          `https://api.challonge.com/v2.1/tournaments/${tournamentIdentifier}/participants/${userParticipant.id}.json`,
          {
            method: 'DELETE',
            headers: {
              'Authorization-Type': 'v1',
              'Authorization': CHALLONGE_CONFIG.apiKey,
              'Content-Type': 'application/vnd.api+json',
              'Accept': 'application/json',
            },
          }
        );

        if (!deleteParticipantResponse.ok) {
          const errorText = await deleteParticipantResponse.text();
          console.error('Failed to delete participant:', errorText);
          return reply.status(deleteParticipantResponse.status).send({ 
            error: 'Failed to leave tournament' 
          });
        }

        // Invalidate cache for this tournament
        invalidateParticipantsCache(tournamentIdentifier);

        // Update tournament participant count in local DB
        const updatedTournament = await prisma.tournament.findUnique({
          where: { id },
        });

        if (updatedTournament && updatedTournament.participantCount > 0) {
          await prisma.tournament.update({
            where: { id },
            data: {
              participantCount: updatedTournament.participantCount - 1,
              lastSyncedAt: new Date(),
            },
          });
        }

        return reply.send({
          success: true,
          message: 'Successfully left tournament',
        });
      } catch (error) {
        console.error('Error leaving tournament:', error);
        return reply.status(500).send({ error: 'Failed to leave tournament' });
      }
    }
  });
}
