import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { calculateMatchWins } from "../utils/elo.js";
import { validatePagination, isValidUUID } from "../utils/validation.js";

export async function adminRoutes(app: FastifyInstance) {
  // Get all users (admin only, paginated)
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    "/users",
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

        // Get total count and users
        const [total, users] = await Promise.all([
          prisma.user.count(),
          prisma.user.findMany({
            select: {
              id: true,
              email: true,
              username: true,
              elo: true,
              admin: true,
              tournamentOrganizer: true,
              blogger: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: pagination.limit,
            skip: pagination.offset,
          }),
        ]);

        // Get all matches for these users to calculate wins
        const userIds = users.map((u) => u.id);
        const matches = await prisma.match.findMany({
          where: {
            OR: [
              { player1Id: { in: userIds } },
              { player2Id: { in: userIds } },
            ],
          },
          select: {
            winner: true,
            player1Id: true,
            player2Id: true,
          },
        });

        // Calculate stats for each user
        const usersWithStats = users.map((user) => {
          const userMatches = matches.filter(
            (m) => m.player1Id === user.id || m.player2Id === user.id
          );
          const totalWins = calculateMatchWins(userMatches, user.id);

          return {
            id: user.id,
            email: user.email,
            username: user.username,
            elo: user.elo,
            isAdmin: user.admin,
            isTournamentOrganizer: user.tournamentOrganizer,
            isBlogger: user.blogger,
            createdAt: user.createdAt,
            totalMatches: userMatches.length,
            totalWins,
          };
        });

        return reply.send({
          users: usersWithStats,
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total,
            hasMore: pagination.offset + pagination.limit < total,
          },
        });
      } catch (error) {
        console.error("Error fetching users:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch users" 
        });
      }
    }
  );
}
