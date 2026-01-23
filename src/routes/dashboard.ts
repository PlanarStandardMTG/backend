import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { userPublicSelect, userPrivateSelect } from "../utils/prismaSelects.js";
import { validatePagination, isValidUUID } from "../utils/validation.js";

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  elo: number;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface UserStats {
  id: string;
  username: string;
  email: string;
  elo: number;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: Array<{
    id: string;
    opponent: {
      id: string;
      username: string;
      elo: number;
    };
    result: "win" | "loss";
    eloChange: number;
    completedAt: Date | null;
  }>;
}

export async function dashboardRoutes(app: FastifyInstance) {
  // Get global leaderboard
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/leaderboard",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const pagination = validatePagination(
          request.query.limit || "100",
          request.query.offset
        );

        if (!pagination.valid) {
          return reply.status(400).send({
            error: "Validation error",
            message: pagination.error
          });
        }

        // Cap leaderboard at 500 entries max for performance
        const limit = Math.min(pagination.limit, 500);

        // Get all users with match statistics
        const users = await prisma.user.findMany({
          select: {
            id: true,
            username: true,
            elo: true,
            matchesAsPlayer1: true,
            matchesAsPlayer2: true,
          },
          orderBy: { elo: "desc" },
          take: limit,
          skip: pagination.offset,
        });

        const leaderboard: LeaderboardEntry[] = users.map((user: any, index: number) => {
          // Count matches
          const matchesAsPlayer1 = user.matchesAsPlayer1.filter(
            (m: any) => m.completedAt !== null
          );
          const matchesAsPlayer2 = user.matchesAsPlayer2.filter(
            (m: any) => m.completedAt !== null
          );
          const totalMatches = matchesAsPlayer1.length + matchesAsPlayer2.length;

          // Count wins
          const wins =
            matchesAsPlayer1.filter((m: any) => m.winner === user.id).length +
            matchesAsPlayer2.filter((m: any) => m.winner === user.id).length;

          const losses = totalMatches - wins;
          const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

          return {
            rank: pagination.offset + index + 1,
            id: user.id,
            username: user.username,
            elo: user.elo,
            totalMatches,
            wins,
            losses,
            winRate: Math.round(winRate * 100) / 100,
          };
        });

        return reply.send(leaderboard);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch leaderboard" 
        });
      }
    }
  );

  // Get detailed user stats
  app.get<{ Params: { userId: string } }>(
    "/stats/:userId",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;

        // Validate user ID format
        if (!isValidUUID(userId)) {
          return reply.status(400).send({
            error: "Validation error",
            message: "Invalid user ID format"
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            ...userPrivateSelect,
            matchesAsPlayer1: true,
            matchesAsPlayer2: true,
          },
        });

        if (!user) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "User not found" 
          });
        }

        // Process matches
        const matchesAsPlayer1 = user.matchesAsPlayer1.filter(
          (m: any) => m.completedAt !== null
        );
        const matchesAsPlayer2 = user.matchesAsPlayer2.filter(
          (m: any) => m.completedAt !== null
        );

        const totalMatches =
          matchesAsPlayer1.length + matchesAsPlayer2.length;
        const wins =
          matchesAsPlayer1.filter((m: any) => m.winner === userId).length +
          matchesAsPlayer2.filter((m: any) => m.winner === userId).length;
        const losses = totalMatches - wins;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

        // Get recent matches (last 10)
        const allMatches = [
          ...matchesAsPlayer1.map((m: any) => ({
            ...m,
            isPlayer1: true,
          })),
          ...matchesAsPlayer2.map((m: any) => ({
            ...m,
            isPlayer1: false,
          })),
        ].sort(
          (a: any, b: any) =>
            (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0)
        );

        const recentMatches = await Promise.all(
          allMatches.slice(0, 10).map(async (match: any) => {
            const opponentId = match.isPlayer1
              ? match.player2Id
              : match.player1Id;
            const opponent = await prisma.user.findUnique({
              where: { id: opponentId },
              select: userPublicSelect,
            });

            const isWin = match.winner === userId;
            const eloChange = match.isPlayer1
              ? match.player1EloChange || 0
              : match.player2EloChange || 0;

            return {
              id: match.id,
              opponent: opponent!,
              result: (isWin ? "win" : "loss") as "win" | "loss",
              eloChange,
              completedAt: match.completedAt,
            };
          })
        );

        const stats: UserStats = {
          id: user.id,
          username: user.username,
          email: user.email,
          elo: user.elo,
          totalMatches,
          wins,
          losses,
          winRate: Math.round(winRate * 100) / 100,
          recentMatches,
        };

        return reply.send(stats);
      } catch (error) {
        console.error("Error fetching user stats:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch user stats" 
        });
      }
    }
  );

  // Get current user's stats
  app.get(
    "/stats/me",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            ...userPrivateSelect,
            matchesAsPlayer1: true,
            matchesAsPlayer2: true,
          },
        });

        if (!user) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "User not found" 
          });
        }

        // Process matches
        const matchesAsPlayer1 = user.matchesAsPlayer1.filter(
          (m: any) => m.completedAt !== null
        );
        const matchesAsPlayer2 = user.matchesAsPlayer2.filter(
          (m: any) => m.completedAt !== null
        );

        const totalMatches =
          matchesAsPlayer1.length + matchesAsPlayer2.length;
        const wins =
          matchesAsPlayer1.filter((m: any) => m.winner === userId).length +
          matchesAsPlayer2.filter((m: any) => m.winner === userId).length;
        const losses = totalMatches - wins;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

        // Get recent matches (last 10)
        const allMatches = [
          ...matchesAsPlayer1.map((m: any) => ({
            ...m,
            isPlayer1: true,
          })),
          ...matchesAsPlayer2.map((m: any) => ({
            ...m,
            isPlayer1: false,
          })),
        ].sort(
          (a: any, b: any) =>
            (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0)
        );

        const recentMatches = await Promise.all(
          allMatches.slice(0, 10).map(async (match: any) => {
            const opponentId = match.isPlayer1
              ? match.player2Id
              : match.player1Id;
            const opponent = await prisma.user.findUnique({
              where: { id: opponentId },
              select: userPublicSelect,
            });

            const isWin = match.winner === userId;
            const eloChange = match.isPlayer1
              ? match.player1EloChange || 0
              : match.player2EloChange || 0;

            return {
              id: match.id,
              opponent: opponent!,
              result: (isWin ? "win" : "loss") as "win" | "loss",
              eloChange,
              completedAt: match.completedAt,
            };
          })
        );

        const stats: UserStats = {
          id: user.id,
          username: user.username,
          email: user.email,
          elo: user.elo,
          totalMatches,
          wins,
          losses,
          winRate: Math.round(winRate * 100) / 100,
          recentMatches,
        };

        return reply.send(stats);
      } catch (error) {
        console.error("Error fetching user stats:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch user stats" 
        });
      }
    }
  );

  // Get active matches for current user
  app.get(
    "/matches/active",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const userId = request.user.sub;

        const activeMatches = await prisma.match.findMany({
          where: {
            OR: [{ player1Id: userId }, { player2Id: userId }],
            completedAt: null,
          },
          include: {
            player1: {
              select: userPublicSelect,
            },
            player2: {
              select: userPublicSelect,
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return reply.send(activeMatches);
      } catch (error) {
        console.error("Error fetching active matches:", error);
        return reply
          .status(500)
          .send({ error: "Failed to fetch active matches" });
      }
    }
  );

  // Get match history for a user
  app.get<{ Params: { userId: string }; Querystring: { limit?: string; offset?: string } }>(
    "/matches/history/:userId",
    {
      onRequest: [app.authenticate],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const limit = Math.min(parseInt(request.query.limit || "50"), 500);
        const offset = parseInt(request.query.offset || "0");

        const matchHistory = await prisma.match.findMany({
          where: {
            OR: [{ player1Id: userId }, { player2Id: userId }],
            completedAt: { not: null },
          },
          include: {
            player1: {
              select: userPublicSelect,
            },
            player2: {
              select: userPublicSelect,
            },
          },
          orderBy: { completedAt: "desc" },
          take: limit,
          skip: offset,
        });

        return reply.send(matchHistory);
      } catch (error) {
        console.error("Error fetching match history:", error);
        return reply
          .status(500)
          .send({ error: "Failed to fetch match history" });
      }
    }
  );
}
