import { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import { createJwtPayload, createUserResponse } from "../utils/prismaSelects.js";
import { isValidEmail, isValidUsername, isValidPasswordHash } from "../utils/validation.js";
import authRateLimit from "../plugins/authRateLimit.js";
import { AuthenticatedRequest } from "../utils/auth.js";

interface RegisterRequest {
    email: string;
    username: string;
    passwordHash: string;
}

interface LoginRequest {
    email: string;
    passwordHash: string;
}

const SALT_ROUNDS = 12; // Recommended salt rounds for bcrypt

export async function authRoutes(fastify: FastifyInstance) {
    // Apply strict rate limiting to auth routes
    await fastify.register(authRateLimit);

    // Register endpoint
    fastify.post<{ Body: RegisterRequest }>(
        "/register",
        async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
            try {
                const { email, username, passwordHash } = request.body;

                // Validate required fields
                if (!email || !username || !passwordHash) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Email, username, and password are required"
                    });
                }

                // Validate email format
                if (!isValidEmail(email)) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Invalid email format"
                    });
                }

                // Validate username format
                if (!isValidUsername(username)) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens"
                    });
                }

                // Validate password hash format (must be 64-character hex string)
                if (!isValidPasswordHash(passwordHash)) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Invalid password hash format"
                    });
                }

                // Normalize email (lowercase, trim)
                const normalizedEmail = email.toLowerCase().trim();
                const normalizedUsername = username.trim();

                // Check if user already exists
                const existingUser = await fastify.prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: normalizedEmail },
                            { username: normalizedUsername }
                        ]
                    }
                });

                if (existingUser) {
                    // Don't reveal which field conflicts for security
                    return reply.code(409).send({
                        error: "Conflict",
                        message: "Email or username already exists"
                    });
                }

                // Hash the received password hash with bcrypt (double-hashing for defense-in-depth)
                const hashedPassword = await bcrypt.hash(passwordHash, SALT_ROUNDS);

                // Create user
                const user = await fastify.prisma.user.create({
                    data: {
                        email: normalizedEmail,
                        username: normalizedUsername,
                        password: hashedPassword
                    }
                });

                // Generate JWT token
                const token = fastify.jwt.sign(createJwtPayload(user));

                return reply.code(201).send({
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    token
                });
            } catch (error) {
                console.error("Registration error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred during registration"
                });
            }
        }
    );

    // Login endpoint
    fastify.post<{ Body: LoginRequest }>(
        "/login",
        async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
            try {
                const { email, passwordHash } = request.body;

                // Validate required fields
                if (!email || !passwordHash) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Email and password are required"
                    });
                }

                // Validate email format
                if (!isValidEmail(email)) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Invalid email format"
                    });
                }

                // Validate password hash format (must be 64-character hex string)
                if (!isValidPasswordHash(passwordHash)) {
                    return reply.code(400).send({
                        error: "Validation error",
                        message: "Invalid password hash format"
                    });
                }

                // Normalize email
                const normalizedEmail = email.toLowerCase().trim();

                // Find user by email
                const user = await fastify.prisma.user.findUnique({
                    where: { email: normalizedEmail }
                });

                // Don't reveal if user exists or not (security best practice)
                if (!user) {
                    return reply.code(401).send({
                        error: "Authentication failed",
                        message: "Invalid credentials"
                    });
                }

                // Verify password hash (comparing hashed frontend hash with stored double-hash)
                const isValidPassword = await bcrypt.compare(passwordHash, user.password);

                if (!isValidPassword) {
                    return reply.code(401).send({
                        error: "Authentication failed",
                        message: "Invalid credentials"
                    });
                }

                // Generate JWT token
                const token = fastify.jwt.sign(createJwtPayload(user));

                return reply.send({ token });
            } catch (error) {
                console.error("Login error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred during login"
                });
            }
        }
    );

    // Delete account endpoint
    fastify.delete(
        "/delete",
        {
            onRequest: [fastify.authenticate]
        },
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            try {
                const userId = request.user.sub;

                // Use transaction to ensure atomicity
                await fastify.prisma.$transaction(async (tx) => {
                    // Find user with rankedInfo
                    const user = await tx.user.findUnique({
                        where: { id: userId },
                        include: { rankedInfo: true }
                    });

                    if (!user) {
                        throw new Error("User not found");
                    }

                    if (user.rankedInfo) {
                        // Check if connected to Challonge
                        if (user.rankedInfo.connectionId) {
                            // Delete ChallongeConnection
                            await tx.challongeConnection.delete({
                                where: { id: user.rankedInfo.connectionId }
                            });
                        }

                        // Update RankedUserInfo to null userId and connectionId
                        await tx.rankedUserInfo.update({
                            where: { id: user.rankedInfo.id },
                            data: {
                                userId: null,
                                connectionId: null
                            }
                        });
                    }

                    // Delete the user
                    await tx.user.delete({
                        where: { id: userId }
                    });
                });

                return reply.code(204).send();
            } catch (error) {
                console.error("Account deletion error:", error);
                if (error instanceof Error && error.message === "User not found") {
                    return reply.code(404).send({
                        error: "Not found",
                        message: "User not found"
                    });
                }
                return reply.code(500).send({
                    error: "Internal server error",
                    message: "An error occurred during account deletion"
                });
            }
        }
    );
}
