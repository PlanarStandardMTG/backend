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
                    where: { id: request.user.sub }
                });

                if (!user) {
                    return reply.code(404).send({
                        error: "Not found",
                        message: "User not found"
                    });
                }

                return createUserResponse(user);
            } catch (error) {
                console.error("Get user error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred while fetching user data"
                });
            }
        }
    );
}
