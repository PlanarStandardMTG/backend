import { FastifyRequest } from "fastify";

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    email: string;
    admin: boolean;
    tournamentOrganizer: boolean;
    blogger: boolean;
  };
}