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
        console.log("Tool input:", { q, position, team, limit });
        const boot = await getBootstrapCached({ allowStale: true });
        console.log("Boot data type:", typeof boot, "has elements:", !!boot?.elements);
        
        if (!boot || !boot.elements) {
          throw new Error("Bootstrap data is invalid or missing elements");
        }
        
        const searchResults = searchPlayers(boot, q, {
          position: position as any,
          team: team as any,
          limit: limit,
        });
        console.log("Search results length:", searchResults?.length);
        
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
}