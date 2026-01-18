import fp from "fastify-plugin";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { PrismaNeon } from "@prisma/adapter-neon";

declare module "fastify" {
    interface FastifyInstance {
        prisma: PrismaClient;
        jwt: any;
    }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorate("prisma", prisma);
}

export default fp(prismaPlugin);
export { prisma };
