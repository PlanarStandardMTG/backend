import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { calculateEloChange } from "../utils/elo.js";
import { userPublicSelect } from "../utils/prismaSelects.js";
import { isValidUUID, validatePagination } from "../utils/validation.js";
import { getOrCreateRankedForUser } from "../utils/ranked.js";

interface CreateMatchRequest {
  // the IDs of the users to create a ranked match between; the system will resolve their
  // associated RankedUserInfo records (creating them as needed)
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
              player1Ranked: {
                include: { user: { select: userPublicSelect } }
              },
              player2Ranked: {
                include: { user: { select: userPublicSelect } }
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

        // Ensure both users exist and fetch their ranked info
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

        const ranked1 = await getOrCreateRankedForUser(player1Id);
        const ranked2 = await getOrCreateRankedForUser(player2Id);

        // Create the match using only ranked identifiers
        const match = await prisma.match.create({
          data: {
            player1RankedId: ranked1.id,
            player2RankedId: ranked2.id,
          },
          include: {
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
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

        // Fetch the match including ranked players (and any linked user info)
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
            },
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

        // Determine which ranked id corresponds to winnerId
        let player1Won: boolean;
        const ranked1Id = match.player1RankedId;
        const ranked2Id = match.player2RankedId;

        if (winnerId === ranked1Id) {
          player1Won = true;
        } else if (winnerId === ranked2Id) {
          player1Won = false;
        } else {
          return reply.status(400).send({ 
            error: "Validation error",
            message: "Winner must be one of the match players (provide a ranked ID)" 
          });
        }

        // Calculate ELO changes using ranked players' current elo
        const eloResult = calculateEloChange(
          match.player1Ranked.elo,
          match.player2Ranked.elo,
          player1Won
        );

        // Update the match and ranked ELOs
        await prisma.$transaction([
          prisma.match.update({
            where: { id: matchId },
            data: {
              winnerRankedId: player1Won ? ranked1Id : ranked2Id,
              player1EloChange: eloResult.player1Change,
              player2EloChange: eloResult.player2Change,
              completedAt: new Date(),
            },
          }),
          prisma.rankedUserInfo.update({
            where: { id: ranked1Id },
            data: { elo: eloResult.player1NewElo },
          }),
          prisma.rankedUserInfo.update({
            where: { id: ranked2Id },
            data: { elo: eloResult.player2NewElo },
          }),
        ]);

        // Fetch updated match with player info
        const finalMatch = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
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
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
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
        // first resolve ranked entry for current user (if exists)
        const ranked = await prisma.rankedUserInfo.findUnique({
          where: { userId },
          select: { id: true },
        });
        const rankedId = ranked?.id;

        const [total, matches] = await Promise.all([
          prisma.match.count({
            where: rankedId
              ? {
                  OR: [
                    { player1RankedId: rankedId },
                    { player2RankedId: rankedId },
                  ],
                }
              : undefined,
          }),
          prisma.match.findMany({
            where: rankedId
              ? {
                  OR: [
                    { player1RankedId: rankedId },
                    { player2RankedId: rankedId },
                  ],
                }
              : undefined,
            include: {
              player1Ranked: {
                include: { user: { select: userPublicSelect } }
              },
              player2Ranked: {
                include: { user: { select: userPublicSelect } }
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
