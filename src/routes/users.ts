import { type FastifyInstance, type FastifyReply } from "fastify";
import { createUserResponse } from "../utils/prismaSelects.js";

export async function userRoutes(fastify: FastifyInstance) {
    // Get current user endpoint - no rate limiting since it's called frequently
    fastify.get(
        "/me",
        {
            preHandler: [fastify.authenticate]
        },
        async (request: any, reply: FastifyReply) => {
            try {
                const user = await fastify.prisma.user.findUnique({
                    where: { id: request.user.sub },
                    include: { rankedInfo: true }
                });

                if (!user) {
                    return reply.code(404).send({
                        error: "Not found",
                        message: "User not found"
                    });
                }

                const ranked = await fastify.prisma.rankedUserInfo.findUnique({
                    where: { userId: user.id }
                });

                // merge elo from rankedInfo if available
                const response = createUserResponse({
                    ...user,
                    elo: ranked?.elo ?? 1600
                });
                return response;
            } catch (error) {
                console.error("Get user error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred while fetching user data"
                });
            }
        }
    );

    // Get a user's ranked info and username by their ID (logged-in only)
    fastify.get(
        "/:id",
        {
            preHandler: [fastify.authenticate]
        },
        async (request: any, reply: FastifyReply) => {
            const { id } = request.params as { id: string };
            try {
                // ensure the user exists before returning any details
                const user = await fastify.prisma.user.findUnique({
                    where: { id }
                });

                if (!user) {
                    return reply.code(404).send({
                        error: "Not found",
                        message: "User not found"
                    });
                }

                // fetch the ranked info record that is linked to this user
                const ranked = await fastify.prisma.rankedUserInfo.findUnique({
                    where: { userId: id }
                });

                return {
                    username: user.username,
                    rankedInfoId: ranked?.id ?? null,
                    elo: ranked?.elo ?? 1600
                };
            } catch (error) {
                console.error("Get user by id error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred while fetching user data"
                });
            }
        }
    );

    // Get a user's info and username by their ranked ID (logged-in only)
    fastify.get(
        "/ranked/:id",
        {
            preHandler: [fastify.authenticate]
        },
        async (request: any, reply: FastifyReply) => {
            const { id } = request.params as { id: string };
            try {
                // ensure the user exists before returning any details
                const ranked = await fastify.prisma.rankedUserInfo.findUnique({
                    where: { id }
                });

                if (!ranked) {
                    return reply.code(404).send({
                        error: "Not found",
                        message: "Ranked user not found"
                    });
                }

                let user = null;

                if (ranked.userId) {
                    // fetch the user that is linked to this ranked info
                    user = await fastify.prisma.user.findUnique({
                        where: { id: ranked.userId }
                    });
                }

                return {
                    username: ranked.username,
                    userId: user?.id ?? null,
                    elo: ranked?.elo ?? 1600
                };
            } catch (error) {
                console.error("Get ranked user by id error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred while fetching user data"
                });
            }
        }
    );
}
