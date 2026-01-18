import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            sub: string;
            email: string;
        };
        user: {
            sub: string;
            email: string;
        };
    }
}

export default fp(async (fastify: FastifyInstance) => {
    fastify.register(jwt, {
        secret: "super-secret-key"
    });

    fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
            await request.jwtVerify();
        }
    );
})
