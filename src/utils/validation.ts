/**
 * Input validation utilities for security
 * All user inputs must be validated on the server side
 */

/**
 * Validate email format
 * RFC 5322 compliant basic validation
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate username format
 * 3-20 characters, alphanumeric plus underscores and hyphens
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }
  
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
  return usernameRegex.test(username);
}

/**
 * Validate password format
 * 8-128 characters
 */
export function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }
  
  return password.length >= 8 && password.length <= 128;
}

/**
 * Validate password hash from frontend
 * Must be a 64-character hexadecimal string (SHA-256 output)
 */
export function isValidPasswordHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  
  const hexRegex = /^[a-f0-9]{64}$/i;
  return hexRegex.test(hash);
}

/**
 * Validate UUID v4 format
 * Used for validating database IDs
 */
export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Sanitize string input to prevent XSS
 * Removes HTML tags and special characters
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validate pagination parameters
 */
export function validatePagination(limit?: string | number, offset?: string | number): {
  valid: boolean;
  limit: number;
  offset: number;
  error?: string;
} {
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : (limit || 10);
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : (offset || 0);

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return {
      valid: false,
      limit: 10,
      offset: 0,
      error: 'Limit must be between 1 and 100',
    };
  }

  if (isNaN(parsedOffset) || parsedOffset < 0) {
    return {
      valid: false,
      limit: parsedLimit,
      offset: 0,
      error: 'Offset must be non-negative',
    };
  }

  return {
    valid: true,
    limit: parsedLimit,
    offset: parsedOffset,
  };
}

/**
 * Validate ELO rating value
 */
export function isValidElo(elo: number): boolean {
  return typeof elo === 'number' && elo >= 0 && elo <= 5000 && !isNaN(elo);
}

/**
 * Validate that a string is not empty after trimming
 */
export function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
