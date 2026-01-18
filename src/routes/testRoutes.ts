import { FastifyInstance } from "fastify";

export async function testRoutes(fastify: FastifyInstance) {

    fastify.get("/", async (request, reply) => {
        return { message: "Test route is working!" };
    })

}