/**
 * ELO Rating System Calculator
 * Standard chess ELO with K-factor of 32 for consistency
 */

interface EloChangeResult {
  player1NewElo: number;
  player2NewElo: number;
  player1Change: number;
  player2Change: number;
}

const K_FACTOR = 32; // Standard K-factor for ELO

/**
 * Calculate expected win probability for a player based on ELO ratings
 */
function getExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Calculate new ELO ratings after a match
 * @param player1Elo - Current ELO rating of player 1
 * @param player2Elo - Current ELO rating of player 2
 * @param player1Won - Whether player 1 won the match
 * @returns Object with new ELO ratings and changes for both players
 */
export function calculateEloChange(
  player1Elo: number,
  player2Elo: number,
  player1Won: boolean
): EloChangeResult {
  const expected1 = getExpectedScore(player1Elo, player2Elo);
  const expected2 = getExpectedScore(player2Elo, player1Elo);

  // Score: 1 for win, 0 for loss
  const score1 = player1Won ? 1 : 0;
  const score2 = player1Won ? 0 : 1;

  // Calculate rating changes
  const change1 = Math.round(K_FACTOR * (score1 - expected1));
  const change2 = Math.round(K_FACTOR * (score2 - expected2));

  return {
    player1NewElo: Math.max(0, player1Elo + change1), // Ensure ELO doesn't go below 0
    player2NewElo: Math.max(0, player2Elo + change2),
    player1Change: change1,
    player2Change: change2,
  };
}

/**
 * Calculate the number of wins for a user from their matches
 * @param matches - Array of matches where the user participated
 * @param userId - The user's ID
 * @returns Number of matches won by the user
 */
export function calculateMatchWins(
  matches: Array<{ winner: string | null; player1Id: string; player2Id: string }>,
  userId: string
): number {
  return matches.filter((match) => match.winner === userId).length;
}

/**
 * Calculate the expected rating for a new user
 * Standard starting ELO is 1600
 */
export function getNewUserElo(): number {
  return 1600;
}
