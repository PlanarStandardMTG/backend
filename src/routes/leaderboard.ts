import { FastifyPluginAsync } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { validatePagination } from "../utils/validation.js";

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
    app.get("/", async (request, reply) => {
        try {
            const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };
            const pageNum = Number(page);
            const limitNum = Math.min(Number(limit), 100); // Cap at 100

            // Validate pagination
            if (isNaN(pageNum) || pageNum < 1) {
                return reply.code(400).send({ 
                    error: "Validation error",
                    message: "Page must be a positive number" 
                });
            }

            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return reply.code(400).send({ 
                    error: "Validation error",
                    message: "Limit must be between 1 and 100" 
                });
            }

            const skip = (pageNum - 1) * limitNum;

            // Get ranked players with at least one match played
            const rankedPlayers = await prisma.rankedUserInfo.findMany({
                where: {
                    OR: [
                        { matchesAsPlayer1: { some: {} } },
                        { matchesAsPlayer2: { some: {} } }
                    ]
                },
                select: {
                    id: true,
                    elo: true,
                    username: true,
                    user: {
                        select: { username: true }
                    },
                    matchesAsPlayer1: {
                        where: {
                            winnerRankedId: { not: null }
                        },
                        select: {
                            winnerRankedId: true
                        }
                    },
                    matchesAsPlayer2: {
                        where: {
                            winnerRankedId: { not: null }
                        },
                        select: {
                            winnerRankedId: true
                        }
                    }
                },
                orderBy: {
                    elo: "desc"
                },
                skip,
                take: limitNum
            });

            // Calculate win counts
            const leaderboard = rankedPlayers.map(player => {
                const winsAsPlayer1 = player.matchesAsPlayer1.filter(m => m.winnerRankedId === player.id).length;
                const winsAsPlayer2 = player.matchesAsPlayer2.filter(m => m.winnerRankedId === player.id).length;

                return {
                    id: player.id,
                    username: player.user?.username || player.username || "",
                    elo: player.elo,
                    winsAsPlayer1,
                    winsAsPlayer2,
                    totalWins: winsAsPlayer1 + winsAsPlayer2,
                    totalMatches: player.matchesAsPlayer1.length + player.matchesAsPlayer2.length
                };
            });

            // Get total count for pagination metadata
            const totalPlayers = await prisma.rankedUserInfo.count({
                where: {
                    OR: [
                        { matchesAsPlayer1: { some: {} } },
                        { matchesAsPlayer2: { some: {} } }
                    ]
                }
            });

            return reply.send({
                leaderboard,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalPlayers,
                    totalPages: Math.ceil(totalPlayers / limitNum)
                }
            });
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            return reply.code(500).send({ 
                error: "Internal server error",
                message: "Failed to fetch leaderboard" 
            });
        }
    });
};
