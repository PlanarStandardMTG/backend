import { prisma } from "../plugins/prisma.js";

/**
 * Fetch or create a RankedUserInfo record for a given user ID.
 * If the record already exists it is returned; otherwise a new entry is created
 * copying the user's current elo and username.
 */
export async function getOrCreateRankedForUser(userId: string) {
  let ranked = await prisma.rankedUserInfo.findUnique({
    where: { userId },
  });

  if (!ranked) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) {
      throw new Error("User not found when creating ranked info");
    }

    ranked = await prisma.rankedUserInfo.create({
      data: {
        userId,
        username: user.username,
        // user elo column removed; default to 1600 for new ranked entries
        elo: 1600,
      },
    });

    // link back to user for convenience
    await prisma.user.update({
      where: { id: userId },
      data: { rankedInfoId: ranked.id },
    });
  }

  return ranked;
}

/**
 * Fetch or create a RankedUserInfo record based on a Challonge username.
 * If a connectionId is provided we will also link it.
 */
export async function getOrCreateRankedForUsername(username: string, connectionId?: string) {
  let ranked = await prisma.rankedUserInfo.findUnique({
    where: { username },
  });

  if (!ranked) {
    ranked = await prisma.rankedUserInfo.create({
      data: {
        username,
        ...(connectionId && { connectionId }),
      },
    });
  } else if (connectionId && ranked.connectionId !== connectionId) {
    ranked = await prisma.rankedUserInfo.update({
      where: { id: ranked.id },
      data: { connectionId },
    });
  }

  return ranked;
}

/**
 * Ensure there's a ranked entry for a connection (possibly unclaimed).
 */
export async function getOrCreateRankedForConnection(connectionId: string) {
  let ranked = await prisma.rankedUserInfo.findUnique({
    where: { connectionId },
  });

  if (!ranked) {
    const conn = await prisma.challongeConnection.findUnique({
      where: { id: connectionId },
      select: { challongeUsername: true, rankedInfoId: true },
    });
    if (!conn) {
      throw new Error("Connection not found");
    }

    ranked = await prisma.rankedUserInfo.create({
      data: {
        connectionId,
        username: conn.challongeUsername,
      },
    });

    // user association is now managed through RankedUserInfo itself; if the connection
    // later gets claimed by a user, the ranking record should be updated separately.
  }

  return ranked;
}
