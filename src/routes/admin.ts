import { type FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { calculateMatchWins, calculateEloChange } from "../utils/elo.js";
import { validatePagination, isValidUUID } from "../utils/validation.js";
import { CHALLONGE_API_BASE, CHALLONGE_CONFIG, fetchTournamentParticipants } from "./challonge.js";
import { getOrCreateRankedForUsername } from "../utils/ranked.js";

export async function adminRoutes(app: FastifyInstance) {
  // Get all users (admin only, paginated)
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    "/users",
    {
      onRequest: [app.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const pagination = validatePagination(request.query.limit, request.query.offset);

        if (!pagination.valid) {
          return reply.status(400).send({
            error: "Validation error",
            message: pagination.error
          });
        }

        // Get total count and users (with ranked info for elo)
        const [total, users] = await Promise.all([
          prisma.user.count(),
          prisma.user.findMany({
            select: {
              id: true,
              email: true,
              username: true,
              admin: true,
              tournamentOrganizer: true,
              blogger: true,
              createdAt: true,
              rankedInfo: {
                select: { elo: true, id: true }
              }
            },
            orderBy: {
              createdAt: "desc",
            },
            take: pagination.limit,
            skip: pagination.offset,
          }),
        ]);

        // Collect ranked ids to query matches
        const rankedIds = users.map((u) => u.rankedInfo?.id).filter((id): id is string => !!id);
        const matches = await prisma.match.findMany({
          where: rankedIds.length
            ? {
                OR: [
                  { player1RankedId: { in: rankedIds } },
                  { player2RankedId: { in: rankedIds } },
                ],
              }
            : undefined,
          select: {
            winnerRankedId: true,
            player1RankedId: true,
            player2RankedId: true,
          },
        });

        // Calculate stats for each user
        const usersWithStats = users.map((user) => {
          const rankedId = user.rankedInfo?.id;
          const userMatches = rankedId
            ? matches.filter(
                (m) => m.player1RankedId === rankedId || m.player2RankedId === rankedId
              )
            : [];
          const totalWins = rankedId
            ? calculateMatchWins(userMatches, rankedId)
            : 0;

          return {
            id: user.id,
            email: user.email,
            username: user.username,
            elo: user.rankedInfo?.elo ?? 0,
            isAdmin: user.admin,
            isTournamentOrganizer: user.tournamentOrganizer,
            isBlogger: user.blogger,
            createdAt: user.createdAt,
            totalMatches: userMatches.length,
            totalWins,
          };
        });

        return reply.send({
          users: usersWithStats,
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total,
            hasMore: pagination.offset + pagination.limit < total,
          },
        });
      } catch (error) {
        console.error("Error fetching users:", error);
        return reply.status(500).send({ 
          error: "Internal server error",
          message: "Failed to fetch users" 
        });
      }
    }
  );

  // Admin endpoint – sync matches for tournaments with ratingsUpdated=false
  app.post(
    "/tournaments/sync-matches",
    {
      onRequest: [app.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const tournaments = await prisma.tournament.findMany({
          where: { ratingsUpdated: false },
          orderBy: { startsAt: "asc" },
        });

        let processed = 0;

        for (const t of tournaments) {
          // fetch participants from Challonge
          const participants = await fetchTournamentParticipants(t.challongeId);
          if (!participants) {
            continue;
          }

          // Ensure there is a connection record for each participant (unclaimed if necessary)
          for (const p of participants) {
            const username = p.attributes?.username;
            if (!username) continue;
            let existingConn = await prisma.challongeConnection.findUnique({
              where: { challongeUsername: username },
            });
            if (!existingConn) {
              existingConn = await prisma.challongeConnection.create({
                data: { challongeUsername: username },
              });
            }

            // also ensure a ranked entry exists for the participant
            await getOrCreateRankedForUsername(username, existingConn.id);
          }

          // fetch matches from Challonge
          const matchesRes = await fetch(
            `${CHALLONGE_API_BASE}/tournaments/${t.challongeId}/matches.json`,
            {
              method: "GET",
              headers: {
                "Authorization-Type": "v1",
                Authorization: CHALLONGE_CONFIG.apiKey,
                "Content-Type": "application/vnd.api+json",
                Accept: "application/json",
              },
            }
          );

          if (!matchesRes.ok) {
            console.warn('Failed to fetch matches for tournament', t.challongeId);
            continue;
          }

          const matchesData = (await matchesRes.json()) as { data: Array<any> };

          for (const m of matchesData.data) {
            const p1Id = m.relationships?.player1?.data?.id;
            const p2Id = m.relationships?.player2?.data?.id;
            if (!p1Id || !p2Id) continue;

            const p1 = participants.find((pp: any) => pp.id.toString() === p1Id.toString());
            const p2 = participants.find((pp: any) => pp.id.toString() === p2Id.toString());
            if (!p1 || !p2) continue;

            // resolve ranked info for each participant (using connection or username)
            const r1 = p1.attributes?.username
              ? await getOrCreateRankedForUsername(p1.attributes.username,
                  (await prisma.challongeConnection.findUnique({ where: { challongeUsername: p1.attributes.username } }))?.id)
              : null;
            const r2 = p2.attributes?.username
              ? await getOrCreateRankedForUsername(p2.attributes.username,
                  (await prisma.challongeConnection.findUnique({ where: { challongeUsername: p2.attributes.username } }))?.id)
              : null;

            if (!r1 || !r2) continue; // can't process without ranked ids

            const ranked1Id = r1.id;
            const ranked2Id = r2.id;

            // determine winner ranked id
            let winnerRankedId: string | null = null;
            const winnerParticipantId = m.attributes?.winner_id;
            if (winnerParticipantId) {
              if (winnerParticipantId.toString() === p1Id.toString()) winnerRankedId = ranked1Id;
              else if (winnerParticipantId.toString() === p2Id.toString()) winnerRankedId = ranked2Id;
            }

            // calculate elo & persist match using ranked elo values
            const eloResult = calculateEloChange(
              r1.elo,
              r2.elo,
              winnerRankedId === ranked1Id
            );

            await prisma.$transaction([
              prisma.match.create({
                data: {
                  player1RankedId: ranked1Id,
                  player2RankedId: ranked2Id,
                  winnerRankedId,
                  player1EloChange: eloResult.player1Change,
                  player2EloChange: eloResult.player2Change,
                  completedAt: winnerRankedId ? new Date() : null,
                },
              }),
              prisma.rankedUserInfo.update({
                where: { id: ranked1Id },
                data: { elo: eloResult.player1NewElo },
              }),
              prisma.rankedUserInfo.update({
                where: { id: ranked2Id },
                data: { elo: eloResult.player2NewElo },
              }),
            ]);
          }

          // mark tournament as processed
          await prisma.tournament.update({
            where: { id: t.id },
            data: { ratingsUpdated: true },
          });

          processed += 1;
        }

        return reply.send({ success: true, processed });
      } catch (error) {
        console.error('Error syncing tournament matches:', error);
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Failed to sync matches',
        });
      }
    }
  );
}
