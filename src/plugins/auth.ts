import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            sub: string;
            email: string;
            admin: boolean;
            tournamentOrganizer: boolean;
            blogger: boolean;
        };
        user: {
            sub: string;
            email: string;
            admin: boolean;
            tournamentOrganizer: boolean;
            blogger: boolean;
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

    fastify.decorate("authenticateAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
            await request.jwtVerify();
            if (!request.user.admin) {
                reply.code(403).send({ error: "Admin privileges required" });
            }
        }
    );
})
