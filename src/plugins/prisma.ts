import fp from "fastify-plugin";
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";
import { FastifyPluginAsync, FastifyInstance } from "fastify";

declare module "fastify" {
    interface FastifyInstance {
        prisma: PrismaClient;
        jwt: any;
    }
}

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaBetterSqlite3({ url: connectionString });
export const prisma = new PrismaClient({ adapter });

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
    await prisma.$connect();
    
    fastify.decorate("prisma", prisma);

    fastify.addHook("onClose", async (fastify) => {
        await fastify.prisma.$disconnect();
    });
})

export default prismaPlugin;
