import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { calculateEloChange } from "../utils/elo.js";
import { userPublicSelect } from "../utils/prismaSelects.js";
import { isValidUUID, validatePagination } from "../utils/validation.js";

interface CreateMatchRequest {
  player1Id: string;
  player2Id: string;
}

interface CompleteMatchRequest {
  winnerId: string;
}

export async function matchRoutes(app: FastifyInstance) {
  // Get all matches (admin only, paginated)
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    "/",
    {
      onRequest: [app.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const pagination = validatePagination(request.query.limit, request.query.offset);

        if (!pagination.valid) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: pagination.error 
          });
        }

        // Get total count and matches
        const [total, matches] = await Promise.all([
          prisma.match.count(),
          prisma.match.findMany({
            include: {
              player1: {
                select: userPublicSelect,
              },
              player2: {
                select: userPublicSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: pagination.limit,
            skip: pagination.offset,
          }),
        ]);

        return reply.send({
          matches,
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total,
            hasMore: pagination.offset + pagination.limit < total,
          },
        });
      } catch (error) {
        console.error("Error fetching matches:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch matches" 
        });
      }
    }
  );

  // Create a new match between two players
  app.post<{ Body: CreateMatchRequest }>(
    "/",
    {
      onRequest: [app.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const { player1Id, player2Id } = request.body;

        // Validate required fields
        if (!player1Id || !player2Id) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Both player IDs are required" 
          });
        }

        // Validate UUID format
        if (!isValidUUID(player1Id)) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Invalid player 1 ID format" 
          });
        }

        if (!isValidUUID(player2Id)) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Invalid player 2 ID format" 
          });
        }

        // Prevent self-matching
        if (player1Id === player2Id) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Cannot create match against yourself" 
          });
        }

        // Validate that both players exist
        const [player1, player2] = await Promise.all([
          prisma.user.findUnique({ where: { id: player1Id } }),
          prisma.user.findUnique({ where: { id: player2Id } }),
        ]);

        if (!player1) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "Player 1 not found" 
          });
        }

        if (!player2) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "Player 2 not found" 
          });
        }

        // Create the match
        const match = await prisma.match.create({
          data: {
            player1Id,
            player2Id,
          },
          include: {
            player1: {
              select: userPublicSelect,
            },
            player2: {
              select: userPublicSelect,
            },
          },
        });

        return reply.status(201).send(match);
      } catch (error) {
        console.error("Error creating match:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to create match" 
        });
      }
    }
  );

  // Complete a match and update ELO
  app.post<{ Params: { matchId: string }; Body: CompleteMatchRequest }>(
    "/:matchId/complete",
    {
      onRequest: [app.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const { matchId } = request.params;
        const { winnerId } = request.body;

        // Validate match ID format
        if (!isValidUUID(matchId)) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Invalid match ID format" 
          });
        }

        // Validate winner ID
        if (!winnerId) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Winner ID is required" 
          });
        }

        if (!isValidUUID(winnerId)) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Invalid winner ID format" 
          });
        }

        // Fetch the match
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: true,
            player2: true,
          },
        });

        if (!match) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "Match not found" 
          });
        }

        // Verify match hasn't already been completed
        if (match.completedAt) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Match already completed" 
          });
        }

        // Validate that winnerId is one of the players
        if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Winner must be one of the match players" 
          });
        }

        // Determine who won
        const player1Won = winnerId === match.player1Id;

        // Calculate ELO changes
        const eloResult = calculateEloChange(
          match.player1.elo,
          match.player2.elo,
          player1Won
        );

        // Update the match and player ELOs in a transaction
        await prisma.$transaction([
          prisma.match.update({
            where: { id: matchId },
            data: {
              winner: winnerId,
              player1EloChange: eloResult.player1Change,
              player2EloChange: eloResult.player2Change,
              completedAt: new Date(),
            },
          }),
          prisma.user.update({
            where: { id: match.player1Id },
            data: { elo: eloResult.player1NewElo },
          }),
          prisma.user.update({
            where: { id: match.player2Id },
            data: { elo: eloResult.player2NewElo },
          }),
        ]);

        // Fetch updated match with player info
        const finalMatch = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: {
              select: userPublicSelect,
            },
            player2: {
              select: userPublicSelect,
            },
          },
        });

        return reply.send({
          match: finalMatch,
          player1EloChange: eloResult.player1Change,
          player2EloChange: eloResult.player2Change,
        });
      } catch (error) {
        console.error("Error completing match:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to complete match" 
        });
      }
    }
  );

  // Get match details
  app.get<{ Params: { matchId: string } }>(
    "/:matchId",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const { matchId } = request.params;

        // Validate match ID format
        if (!isValidUUID(matchId)) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Invalid match ID format" 
          });
        }

        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: {
              select: userPublicSelect,
            },
            player2: {
              select: userPublicSelect,
            },
          },
        });

        if (!match) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "Match not found" 
          });
        }

        return reply.send(match);
      } catch (error) {
        console.error("Error fetching match:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch match" 
        });
      }
    }
  );

  // Get all matches for the authenticated user (paginated)
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    "/user",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;
        
        const pagination = validatePagination(request.query.limit, request.query.offset);

        if (!pagination.valid) {
          return reply.status(400).send({ 
            error: "Validation error",
            message: pagination.error 
          });
        }

        // Get total count and matches
        const [total, matches] = await Promise.all([
          prisma.match.count({
            where: {
              OR: [{ player1Id: userId }, { player2Id: userId }],
            },
          }),
          prisma.match.findMany({
            where: {
              OR: [{ player1Id: userId }, { player2Id: userId }],
            },
            include: {
              player1: {
                select: userPublicSelect,
              },
              player2: {
                select: userPublicSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: pagination.limit,
            skip: pagination.offset,
          }),
        ]);

        return reply.send({
          matches,
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total,
            hasMore: pagination.offset + pagination.limit < total,
          },
        });
      } catch (error) {
        console.error("Error fetching user matches:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch matches" 
        });
      }
    }
  );
}
