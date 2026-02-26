import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { userPublicSelect, userPrivateSelect } from "../utils/prismaSelects.js";
import { isValidUUID } from "../utils/validation.js";

// NOTE: leaderboard endpoint was removed; use /api/leaderboard instead

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
  // (Leaderboard endpoint removed; clients should call /api/leaderboard)

  // Get detailed user stats (by ID)
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
            rankedInfo: true,
          },
        });

        if (!user) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "User not found" 
          });
        }

        const rankedId = user.rankedInfo?.id;

        // fetch matches via ranked id; if the user has no ranked entry we simply return empty
        const matches = await prisma.match.findMany({
          where: rankedId
            ? {
                OR: [
                  { player1RankedId: rankedId },
                  { player2RankedId: rankedId },
                ],
              }
            : {},
        });

        const completed = matches.filter((m: any) => m.completedAt !== null);
        const totalMatches = completed.length;
        const wins = completed.filter((m: any) => m.winnerRankedId === rankedId).length;
        const losses = totalMatches - wins;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

        const sorted = [...completed].sort(
          (a: any, b: any) =>
            (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0)
        );

        const recentMatches = await Promise.all(
          sorted.slice(0, 10).map(async (match: any) => {
            // determine if current user is player1 for this match (ranked only)
            const isPlayer1 = match.player1RankedId === rankedId;

            let opponentInfo: any = { id: "", username: "", elo: 0 };
            const opponentRankedId = isPlayer1
              ? match.player2RankedId
              : match.player1RankedId;
            if (opponentRankedId) {
              const opponent = await prisma.rankedUserInfo.findUnique({
                where: { id: opponentRankedId },
                include: { user: { select: userPublicSelect } },
              });
              if (opponent) {
                opponentInfo = {
                  id: opponent.id,
                  username: opponent.user?.username || opponent.username || "",
                  elo: opponent.elo,
                };
              }
            }

            const isWin = match.winnerRankedId === rankedId;
            const eloChange = isPlayer1 ? match.player1EloChange || 0 : match.player2EloChange || 0;

            return {
              id: match.id,
              opponent: opponentInfo,
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
          elo: user.rankedInfo?.elo ?? 1600,
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
            rankedInfo: true,
          },
        });

        if (!user) {
          return reply.status(404).send({ 
            error: "Not found",
            message: "User not found" 
          });
        }

        const rankedId = user.rankedInfo?.id;

        const matches = await prisma.match.findMany({
          where: rankedId
            ? {
                OR: [
                  { player1RankedId: rankedId },
                  { player2RankedId: rankedId },
                ],
              }
            : {},
        });

        const completed = matches.filter((m: any) => m.completedAt !== null);
        const totalMatches = completed.length;
        const wins = completed.filter((m: any) => m.winnerRankedId === rankedId).length;
        const losses = totalMatches - wins;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

        const sorted = [...completed].sort(
          (a: any, b: any) =>
            (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0)
        );

        const recentMatches = await Promise.all(
          sorted.slice(0, 10).map(async (match: any) => {
            const isPlayer1 = match.player1RankedId === rankedId;

            let opponentInfo: any = { id: "", username: "", elo: 0 };
            const opponentRankedId = isPlayer1
              ? match.player2RankedId
              : match.player1RankedId;
            if (opponentRankedId) {
              const opponent = await prisma.rankedUserInfo.findUnique({
                where: { id: opponentRankedId },
                include: { user: { select: userPublicSelect } },
              });
              if (opponent) {
                opponentInfo = {
                  id: opponent.id,
                  username: opponent.user?.username || opponent.username || "",
                  elo: opponent.elo,
                };
              }
            }

            const isWin = match.winnerRankedId === rankedId;
            const eloChange = isPlayer1 ? match.player1EloChange || 0 : match.player2EloChange || 0;

            return {
              id: match.id,
              opponent: opponentInfo,
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
          elo: user.rankedInfo?.elo ?? 1600,
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
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { rankedInfo: true },
        });
        const rankedId = user?.rankedInfo?.id;

        const activeMatches = await prisma.match.findMany({
          where: {
            OR: rankedId
              ? [
                  { player1RankedId: rankedId },
                  { player2RankedId: rankedId },
                ]
              : [],
            completedAt: null,
          },
          include: {
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
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

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { rankedInfo: true },
        });
        const rankedId = user?.rankedInfo?.id;

        const matchHistory = await prisma.match.findMany({
          where: {
            OR: rankedId
              ? [
                  { player1RankedId: rankedId },
                  { player2RankedId: rankedId },
                ]
              : [],
            completedAt: { not: null },
          },
          include: {
            player1Ranked: {
              include: { user: { select: userPublicSelect } }
            },
            player2Ranked: {
              include: { user: { select: userPublicSelect } }
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
