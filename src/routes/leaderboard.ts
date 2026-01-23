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

            // Get all users with at least one match played
            const users = await prisma.user.findMany({
                where: {
                    OR: [
                        { matchesAsPlayer1: { some: {} } },
                        { matchesAsPlayer2: { some: {} } }
                    ]
                },
                select: {
                    id: true,
                    username: true,
                    elo: true,
                    matchesAsPlayer1: {
                        where: {
                            winner: { not: null }
                        },
                        select: {
                            winner: true
                        }
                    },
                    matchesAsPlayer2: {
                        where: {
                            winner: { not: null }
                        },
                        select: {
                            winner: true
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
            const leaderboard = users.map(user => {
                const winsAsPlayer1 = user.matchesAsPlayer1.filter(match => match.winner === user.id).length;
                const winsAsPlayer2 = user.matchesAsPlayer2.filter(match => match.winner === user.id).length;

                return {
                    id: user.id,
                    username: user.username,
                    elo: user.elo,
                    winsAsPlayer1,
                    winsAsPlayer2,
                    totalWins: winsAsPlayer1 + winsAsPlayer2,
                    totalMatches: user.matchesAsPlayer1.length + user.matchesAsPlayer2.length
                };
            });

            // Get total count for pagination metadata
            const totalPlayers = await prisma.user.count({
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
