/**
 * Shared Prisma select objects to follow DRY principles
 * These constants define commonly used field selections across the application
 */

/**
 * Basic user fields returned in public contexts (matches, leaderboard, etc.)
 * Includes: id, username, elo, and all role flags
 */
export const userPublicSelect = {
  id: true,
  username: true,
  elo: true,
  admin: true,
  tournamentOrganizer: true,
  blogger: true,
} as const;

/**
 * Full user fields including private information (email)
 * Used for authenticated user's own data
 */
export const userPrivateSelect = {
  id: true,
  username: true,
  email: true,
  elo: true,
  admin: true,
  tournamentOrganizer: true,
  blogger: true,
} as const;

/**
 * JWT payload fields extracted from a user object
 * Used for creating authentication tokens
 */
export const createJwtPayload = (user: {
  id: string;
  email: string;
  admin: boolean;
  tournamentOrganizer: boolean;
  blogger: boolean;
}) => ({
  sub: user.id,
  email: user.email,
  admin: user.admin,
  tournamentOrganizer: user.tournamentOrganizer,
  blogger: user.blogger,
});

/**
 * Public user response object (excludes password, timestamps)
 * Used in registration and profile responses
 */
export const createUserResponse = (user: {
  id: string;
  username: string;
  email: string;
  elo: number;
  admin: boolean;
  tournamentOrganizer: boolean;
  blogger: boolean;
}) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  elo: user.elo,
  admin: user.admin,
  tournamentOrganizer: user.tournamentOrganizer,
  blogger: user.blogger,
});
