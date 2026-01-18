import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { calculateEloChange } from "../utils/elo.js";

interface CreateMatchRequest {
  player2Id: string;
}

interface CompleteMatchRequest {
  winnerId: string;
}

export async function matchRoutes(app: FastifyInstance) {
  // Create a new match between two players
  app.post<{ Body: CreateMatchRequest }>(
    "/matches",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const player1Id = request.user.sub;
        const { player2Id } = request.body;

        // Validate that both players exist
        const [player1, player2] = await Promise.all([
          prisma.user.findUnique({ where: { id: player1Id } }),
          prisma.user.findUnique({ where: { id: player2Id } }),
        ]);

        if (!player1) {
          return reply.status(404).send({ error: "Player 1 not found" });
        }

        if (!player2) {
          return reply.status(404).send({ error: "Player 2 not found" });
        }

        // Prevent self-matching
        if (player1Id === player2Id) {
          return reply
            .status(400)
            .send({ error: "Cannot create match against yourself" });
        }

        // Create the match
        const match = await prisma.match.create({
          data: {
            player1Id,
            player2Id,
          },
          include: {
            player1: {
              select: { id: true, username: true, elo: true },
            },
            player2: {
              select: { id: true, username: true, elo: true },
            },
          },
        });

        return reply.status(201).send(match);
      } catch (error) {
        console.error("Error creating match:", error);
        return reply.status(500).send({ error: "Failed to create match" });
      }
    }
  );

  // Complete a match and update ELO
  app.post<{ Params: { matchId: string }; Body: CompleteMatchRequest }>(
    "/matches/:matchId/complete",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const { matchId } = request.params;
        const { winnerId } = request.body;
        const userId = request.user.sub;

        // Fetch the match
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: true,
            player2: true,
          },
        });

        if (!match) {
          return reply.status(404).send({ error: "Match not found" });
        }

        // Verify the user is one of the players
        if (match.player1Id !== userId && match.player2Id !== userId) {
          return reply
            .status(403)
            .send({ error: "Unauthorized to complete this match" });
        }

        // Verify match hasn't already been completed
        if (match.completedAt) {
          return reply.status(400).send({ error: "Match already completed" });
        }

        // Validate that winnerId is one of the players
        if (
          winnerId !== match.player1Id &&
          winnerId !== match.player2Id
        ) {
          return reply
            .status(400)
            .send({ error: "Winner must be one of the match players" });
        }

        // Determine who won
        const player1Won = winnerId === match.player1Id;

        // Calculate ELO changes
        const eloResult = calculateEloChange(
          match.player1.elo,
          match.player2.elo,
          player1Won
        );

        // Update the match and player ELOs
        const updatedMatch = await prisma.match.update({
          where: { id: matchId },
          data: {
            winner: winnerId,
            player1EloChange: eloResult.player1Change,
            player2EloChange: eloResult.player2Change,
            completedAt: new Date(),
          },
        });

        // Update both players' ELO ratings
        await Promise.all([
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
              select: { id: true, username: true, elo: true },
            },
            player2: {
              select: { id: true, username: true, elo: true },
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
        return reply.status(500).send({ error: "Failed to complete match" });
      }
    }
  );

  // Get match details
  app.get<{ Params: { matchId: string } }>(
    "/matches/:matchId",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const { matchId } = request.params;

        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                elo: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                elo: true,
              },
            },
          },
        });

        if (!match) {
          return reply.status(404).send({ error: "Match not found" });
        }

        return reply.send(match);
      } catch (error) {
        console.error("Error fetching match:", error);
        return reply.status(500).send({ error: "Failed to fetch match" });
      }
    }
  );
}
