import { type FastifyInstance } from "fastify";
import bcrypt from "bcrypt";

export async function authRoutes(fastify: FastifyInstance) {

    fastify.post("/register", async (request, reply) => {
        const { email, username, password } = request.body as any;

        const hashed = await bcrypt.hash(password, 10);

        const user = await fastify.prisma.user.create({
            data: { email, username, password: hashed }
        });

        const token = fastify.jwt.sign({ sub: user.id, email: user.email, admin: user.admin });
        return { id: user.id, email: user.email, username: user.username, token };
    });

    fastify.post("/login", async (request, reply) => {
        const { email, password } = request.body as any;

        const user = await fastify.prisma.user.findUnique({ where: { email }});
        if (!user) return reply.code(401).send({ message: "Invalid credentials" });
        
        const valid = await bcrypt.compare(password, user!.password);
        if (!valid) return reply.code(401).send({ message: "Invalid credentials" });

        const token = fastify.jwt.sign({ sub: user!.id, email: user!.email, admin: user!.admin });
        return { token };
    });

    fastify.get("/me", { preHandler: [fastify.authenticate] }, async (request: any, reply: any) => {
        const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } });
        if (!user) return reply.code(404).send({ message: "User not found" });

        return { id: user.id, email: user.email, username: user.username, elo: user.elo, admin: user.admin };
    });

}
