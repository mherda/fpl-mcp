// src/tools.ts - Rewritten from scratch following official MCP TypeScript SDK docs
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getBootstrapCached,
  findPlayerById,
  resolvePlayerByName,
  searchPlayers,
  priceLabel,
  teamShort,
  topByPrice,
  POSITION_ID_TO_SHORT,
  getFixtureDifficulty,
  getUnavailablePlayers,
} from "./cache.js";

export function registerFplTools(server: McpServer) {
  // Tool 1: search_players
  server.registerTool(
    "search_players",
    {
      title: "Search players by name",
      description: "Find players by free-text name (surname or any part). Optional filters: position (1..4 or GKP/DEF/MID/FWD) and team (id, short code, or full name). Returns id, names, team, position, price, status.",
      inputSchema: {
        q: z.string().min(2).describe("Search query for player name"),
        position: z.enum(["1", "2", "3", "4", "GKP", "DEF", "MID", "FWD"]).optional().describe("Position filter"),
        team: z.union([z.number().int().positive(), z.string().min(2)]).optional().describe("Team filter"),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results"),
      },
    },
    async ({ q, position, team, limit }) => {
      try {
        const boot = await getBootstrapCached({ allowStale: true });
        const searchResults = searchPlayers(boot, q, {
          position: position as any,
          team: team as any,
          limit: limit,
        });
        
        const results = searchResults.map((p: any) => ({
          id: Number(p.id),
          web_name: String(p.web_name || ""),
          first_name: String(p.first_name || ""),
          second_name: String(p.second_name || ""),
          team: String(teamShort(boot, p.team) || ""),
          position: String(POSITION_ID_TO_SHORT[p.element_type] || ""),
          now_cost: Number(p.now_cost || 0),
          price_label: String(priceLabel(p.now_cost) || ""),
          status: String(p.status || ""),
          total_points: Number(p.total_points || 0),
          selected_by_percent: String(p.selected_by_percent || "0"),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: results.length, results }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text", 
              text: JSON.stringify({ error: "Search failed", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: get_player_info
  server.registerTool(
    "get_player_info", 
    {
      title: "Get player info by id or name",
      description: "Return a player's id, names, team, position, availability, current price, selection %, form, points per game, total points. Provide either id or a name (surname allowed).",
      inputSchema: {
        id: z.number().int().positive().optional().describe("Player ID"),
        name: z.string().min(2).optional().describe("Player name (surname allowed)"),
      },
    },
    async ({ id, name }) => {
      try {
        if (!id && !name) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "Provide either id or name" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const boot = await getBootstrapCached({ allowStale: true });

        let p: any | null = null;
        if (id) p = findPlayerById(boot, id);
        if (!p && name) p = resolvePlayerByName(boot, name);

        if (!p) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "Player not found" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const info = {
          id: Number(p.id),
          web_name: String(p.web_name || ""),
          first_name: String(p.first_name || ""),
          second_name: String(p.second_name || ""),
          team: String(teamShort(boot, p.team) || ""),
          position: String(POSITION_ID_TO_SHORT[p.element_type] || ""),
          status: String(p.status || ""),
          chance_of_playing_next_round: p.chance_of_playing_next_round ? Number(p.chance_of_playing_next_round) : null,
          news: String(p.news || ""),
          now_cost: Number(p.now_cost || 0),
          price_label: String(priceLabel(p.now_cost) || ""),
          selected_by_percent: String(p.selected_by_percent || "0"),
          form: String(p.form || "0"),
          points_per_game: String(p.points_per_game || "0"),
          total_points: Number(p.total_points || 0),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to get player info", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: top_by_price
  server.registerTool(
    "top_by_price",
    {
      title: "Top N by price within a position",
      description: "List the most expensive players for a given position using cached bootstrap.",
      inputSchema: {
        position: z.enum(["1", "2", "3", "4"]).describe("Position: 1=GKP, 2=DEF, 3=MID, 4=FWD"),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results"),
      },
    },
    async ({ position, limit }) => {
      try {
        const boot = await getBootstrapCached({ allowStale: true });
        const rows = topByPrice(boot, Number(position), limit).map((p: any) => ({
          id: Number(p.id),
          name: String(p.web_name || ""),
          team: String(teamShort(boot, p.team) || ""),
          position: String(POSITION_ID_TO_SHORT[p.element_type] || ""),
          price: String(priceLabel(p.now_cost) || ""),
          total_points: Number(p.total_points || 0),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ position, rows }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to get top players", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 4: refresh_bootstrap
  server.registerTool(
    "refresh_bootstrap",
    {
      title: "Force refresh bootstrap cache",
      description: "Fetch bootstrap and refresh KV.",
      inputSchema: {},
    },
    async () => {
      try {
        const { fetchUpstream, setBootstrap } = await import("./cache.js");
        const env = await fetchUpstream().then(setBootstrap);
        const meta = {
          fetchedAt: new Date(env.fetchedAt).toISOString(),
          elements: env.payload.elements?.length ?? 0,
          teams: env.payload.teams?.length ?? 0,
          events: env.payload.events?.length ?? 0,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(meta, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to refresh bootstrap", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 5: fixture_difficulty
  server.registerTool(
    "fixture_difficulty",
    {
      title: "Get fixture difficulty for teams",
      description: "Returns fixture difficulty ratings for teams over the next few gameweeks. Lower difficulty = easier opponent. Difficulty scale typically 2-5.",
      inputSchema: {
        teams: z.array(z.union([z.number().int().positive(), z.string().min(2)])).optional().describe("Team IDs or short names (e.g., [1, 2] or ['ARS', 'CHE']). If not provided, returns all teams."),
        gameweeks: z.number().int().min(1).max(10).default(3).describe("Number of upcoming gameweeks to analyze"),
      },
    },
    async ({ teams, gameweeks }) => {
      try {
        const bootstrap = await getBootstrapCached({ allowStale: true });
        
        // Convert team names to IDs if needed
        let teamIds: number[] | undefined;
        if (teams && teams.length > 0) {
          teamIds = teams.map((team: any) => {
            if (typeof team === "number") return team;
            // Find team by short name or full name
            const foundTeam = bootstrap.teams.find((t: any) => 
              t.short_name.toLowerCase() === String(team).toLowerCase() ||
              t.name.toLowerCase() === String(team).toLowerCase()
            );
            return foundTeam?.id || null;
          }).filter((id: any) => id !== null);
          
          if (teamIds.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "No valid teams found" }, null, 2),
                },
              ],
              isError: true,
            };
          }
        }

        const difficultyData = await getFixtureDifficulty(teamIds, gameweeks);
        
        // Enhance with team names for readability
        const enhancedData = {
          gameweeks: difficultyData.gameweeks,
          teams: {} as any
        };

        Object.entries(difficultyData.teamFixtures).forEach(([teamId, fixtures]: [string, any]) => {
          const team = bootstrap.teams.find((t: any) => t.id === Number(teamId));
          const teamName = team ? team.short_name : `Team ${teamId}`;
          
          enhancedData.teams[teamName] = {
            id: Number(teamId),
            fixtures: fixtures.map((fixture: any) => {
              const opponent = bootstrap.teams.find((t: any) => t.id === fixture.opponent);
              return {
                gameweek: fixture.event,
                opponent: opponent ? opponent.short_name : `Team ${fixture.opponent}`,
                isHome: fixture.isHome,
                difficulty: fixture.difficulty,
                kickoffTime: fixture.kickoffTime
              };
            }),
            averageDifficulty: (fixtures.reduce((sum: number, f: any) => sum + f.difficulty, 0) / fixtures.length).toFixed(1)
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(enhancedData, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to get fixture difficulty", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 6: unavailable_players
  server.registerTool(
    "unavailable_players",
    {
      title: "Get injured and unavailable players",
      description: "Returns players who are injured, suspended, doubtful, or otherwise unavailable. Includes injury news and availability percentages.",
      inputSchema: {
        position: z.enum(["1", "2", "3", "4", "GKP", "DEF", "MID", "FWD"]).optional().describe("Position filter: 1=GKP, 2=DEF, 3=MID, 4=FWD"),
        team: z.union([z.number().int().positive(), z.string().min(2)]).optional().describe("Team filter (ID or short name like 'ARS')"),
        includeDoubtful: z.boolean().default(true).describe("Include players with injury concerns but still available"),
      },
    },
    async ({ position, team, includeDoubtful }) => {
      try {
        const boot = await getBootstrapCached({ allowStale: true });
        
        const unavailablePlayers = getUnavailablePlayers(boot, {
          position: position as any,
          team: team as any,
          includeDoubtful: includeDoubtful
        });

        // Group by status for better organization
        const grouped = {
          injured: unavailablePlayers.filter((p: any) => p.status === "i" || p.status === "d"),
          suspended: unavailablePlayers.filter((p: any) => p.status === "s"),
          unavailable: unavailablePlayers.filter((p: any) => p.status === "u" || p.status === "n"),
          doubtful: unavailablePlayers.filter((p: any) => p.status === "a" && (p.news || p.chanceOfPlayingNextRound < 100))
        };

        const summary = {
          totalCount: unavailablePlayers.length,
          injured: grouped.injured.length,
          suspended: grouped.suspended.length, 
          unavailable: grouped.unavailable.length,
          doubtful: grouped.doubtful.length
        };

        const result = {
          summary,
          players: {
            injured: grouped.injured,
            suspended: grouped.suspended,
            unavailable: grouped.unavailable,
            doubtful: grouped.doubtful
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Failed to get unavailable players", details: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}