// src/tools.ts
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

/** Always return a string for MCP text content */
const asJsonText = (v: unknown) => JSON.stringify(v); // or JSON.stringify(v, null, 2) if you prefer pretty

/* ---------- Zod schemas for MCP registerTool ---------- */
const GetPlayerInfoInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(2).optional(),
});

const SearchPlayersInputSchema = z.object({
  q: z.string().min(2),
  position: z.enum(["1", "2", "3", "4", "GKP", "DEF", "MID", "FWD"]).optional(),
  team: z.union([z.number().int().positive(), z.string().min(2)]).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const TopByPriceInputSchema = z.object({
  position: z.enum(["1", "2", "3", "4"]).describe("1=GKP, 2=DEF, 3=MID, 4=FWD"),
  limit: z.number().int().min(1).max(50).default(10),
});

const RefreshBootstrapInputSchema = z.object({});

// Extract the input shapes for MCP
const GetPlayerInfoInput = {
  id: z.number().int().positive().optional(),
  name: z.string().min(2).optional(),
} as const;

const SearchPlayersInput = {
  q: z.string().min(2),
  position: z.enum(["1", "2", "3", "4", "GKP", "DEF", "MID", "FWD"]).optional(),
  team: z.union([z.number().int().positive(), z.string().min(2)]).optional(),
  limit: z.number().int().min(1).max(50).default(10),
} as const;

const TopByPriceInput = {
  position: z.enum(["1", "2", "3", "4"]).describe("1=GKP, 2=DEF, 3=MID, 4=FWD"),
  limit: z.number().int().min(1).max(50).default(10),
} as const;

const RefreshBootstrapInput = {} as const;

/* ---------- registration ---------- */
export function registerFplTools(server: McpServer) {
  // search_players
  server.registerTool(
    "search_players",
    {
      title: "Search players by name",
      description:
        "Find players by free-text name (surname or any part). Optional filters: position (1..4 or GKP/DEF/MID/FWD) and team (id, short code, or full name). Returns id, names, team, position, price, status.",
      inputSchema: SearchPlayersInput,
    },
    async (input) => {
      const args = SearchPlayersInputSchema.parse(input);
      const boot = await getBootstrapCached({ allowStale: true });
      const results = searchPlayers(boot, args.q, {
        position: args.position as any,
        team: args.team as any,
        limit: args.limit,
      }).map((p: any) => ({
        id: p.id,
        web_name: p.web_name,
        first_name: p.first_name,
        second_name: p.second_name,
        team: teamShort(boot, p.team),
        position: POSITION_ID_TO_SHORT[p.element_type],
        now_cost: p.now_cost,
        price_label: priceLabel(p.now_cost),
        status: p.status,
        total_points: p.total_points,
        selected_by_percent: p.selected_by_percent,
      }));

      return { content: [{ type: "text", text: asJsonText({ count: results.length, results }) }] };
    }
  );

  // get_player_info
  server.registerTool(
    "get_player_info",
    {
      title: "Get player info by id or name",
      description:
        "Return a player's id, names, team, position, availability, current price, selection %, form, points per game, total points. Provide either id or a name (surname allowed).",
      inputSchema: GetPlayerInfoInput,
    },
    async (input) => {
      const args = GetPlayerInfoInputSchema.parse(input);
      
      // Validate that either id or name is provided
      if (!args.id && !args.name) {
        return { isError: true, content: [{ type: "text", text: "Provide either id or name." }] };
      }
      
      const boot = await getBootstrapCached({ allowStale: true });

      let p: any | null = null;
      if (args.id) p = findPlayerById(boot, args.id);
      if (!p && args.name) p = resolvePlayerByName(boot, args.name);

      if (!p) return { isError: true, content: [{ type: "text", text: "Player not found" }] };

      const info = {
        id: p.id,
        web_name: p.web_name,
        first_name: p.first_name,
        second_name: p.second_name,
        team: teamShort(boot, p.team),
        position: POSITION_ID_TO_SHORT[p.element_type],
        status: p.status,
        chance_of_playing_next_round: p.chance_of_playing_next_round,
        news: p.news,
        now_cost: p.now_cost,
        price_label: priceLabel(p.now_cost),
        selected_by_percent: p.selected_by_percent,
        form: p.form,
        points_per_game: p.points_per_game,
        total_points: p.total_points,
      };

      return { content: [{ type: "text", text: asJsonText(info) }] };
    }
  );

  // top_by_price
  server.registerTool(
    "top_by_price",
    {
      title: "Top N by price within a position",
      description: "List the most expensive players for a given position using cached bootstrap.",
      inputSchema: TopByPriceInput,
    },
    async (input) => {
      const args = TopByPriceInputSchema.parse(input);
      const boot = await getBootstrapCached({ allowStale: true });
      const rows = topByPrice(boot, Number(args.position), args.limit).map((p: any) => ({
        id: p.id,
        name: p.web_name,
        team: teamShort(boot, p.team),
        position: POSITION_ID_TO_SHORT[p.element_type],
        price: priceLabel(p.now_cost),
        total_points: p.total_points,
      }));

      return { content: [{ type: "text", text: asJsonText({ position: args.position, rows }) }] };
    }
  );

  // refresh_bootstrap (unchanged)
  server.registerTool(
    "refresh_bootstrap",
    {
      title: "Force refresh bootstrap cache",
      description: "Fetch bootstrap and refresh KV.",
      inputSchema: RefreshBootstrapInput,
    },
    async () => {
      const { fetchUpstream, setBootstrap } = await import("./cache.js");
      const env = await fetchUpstream().then(setBootstrap);
      const meta = {
        fetchedAt: new Date(env.fetchedAt).toISOString(),
        elements: env.payload.elements?.length ?? 0,
        teams: env.payload.teams?.length ?? 0,
        events: env.payload.events?.length ?? 0,
      };
      return { content: [{ type: "text", text: asJsonText(meta) }] };
    }
  );
}
