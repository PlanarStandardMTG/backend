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
  scope: 'me tournaments:read tournaments:write matches:read matches:write'
};

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
        try {
          const meResponse = await fetch('https://api.challonge.com/v2.1/me.json', {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/vnd.api+json',
              'Accept': 'application/json',
            },
          });
          if (meResponse.ok) {
            const meData = await meResponse.json() as {
              data: {
                attributes: {
                  username?: string;
                };
              };
            };
            challongeUsername = meData.data.attributes.username;
          }
        } catch (error) {
          console.warn('Failed to fetch Challonge username:', error);
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
                const participantsResponse = await fetch(
                  `https://api.challonge.com/v2.1/tournaments/${tournament.id}/participants.json`,
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

                if (participantsResponse.ok) {
                  const participantsData = await participantsResponse.json() as {
                    data: Array<{
                      attributes: {
                        name?: string;
                        username?: string;
                      };
                    }>;
                  };

                  const participant = participantsData.data.find(
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
            const participantsResponse = await fetch(
              `https://api.challonge.com/v2.1/tournaments/${tournament.id}/participants.json`,
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

            if (participantsResponse.ok) {
              const participantsData = await participantsResponse.json() as {
                data: Array<{
                  attributes: {
                    name?: string;
                    username?: string;
                  };
                }>;
              };

              const participant = participantsData.data.find(
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
}
