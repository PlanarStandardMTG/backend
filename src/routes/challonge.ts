import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../plugins/prisma.js';

// Challonge OAuth Configuration
const CHALLONGE_CONFIG = {
  clientId: process.env.CHALLONGE_CLIENT_ID || 'YOUR_CHALLONGE_CLIENT_ID',
  clientSecret: process.env.CHALLONGE_CLIENT_SECRET || 'YOUR_CHALLONGE_CLIENT_SECRET',
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

        // Store or update the connection
        const connection = await prisma.challongeConnection.upsert({
          where: { userId: request.user.sub },
          create: {
            userId: request.user.sub,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope || CHALLONGE_CONFIG.scope,
          },
          update: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope || CHALLONGE_CONFIG.scope,
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
}
