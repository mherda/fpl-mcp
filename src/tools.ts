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

/* ---------- raw shapes for MCP registerTool ---------- */
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
  // 1) search_players — fuzzy search & filters → list of candidates with ids
  server.registerTool(
    "search_players",
    {
      title: "Search players by name",
      description:
        "Find players by free-text name (surname or any part). Optional filters: position (1..4 or GKP/DEF/MID/FWD) and team (id, short code, or full name). Returns id, names, team, position, price, status.",
      inputSchema: SearchPlayersInput,
    },
    async (input) => {
      const args = z.object(SearchPlayersInput).parse(input);
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
      return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
    }
  );

  // 2) get_player_info — by id OR name → single rich info object
  server.registerTool(
    "get_player_info",
    {
      title: "Get player info by id or name",
      description:
        "Return a player's id, names, team, position, availability, current price, selection %, form, points per game, total points. Provide either id or a name (surname allowed).",
      inputSchema: GetPlayerInfoInput,
    },
    async (input) => {
      const parsed = z.object(GetPlayerInfoInput).parse(input);
      const boot = await getBootstrapCached({ allowStale: true });

      let p: any | null = null;
      if (parsed.id) p = findPlayerById(boot, parsed.id);
      if (!p && parsed.name) p = resolvePlayerByName(boot, parsed.name);

      if (!p) {
        return { isError: true, content: [{ type: "text", text: "Player not found" }] };
      }

      const info = {
        id: p.id,
        web_name: p.web_name,
        first_name: p.first_name,
        second_name: p.second_name,
        team: teamShort(boot, p.team),
        position: POSITION_ID_TO_SHORT[p.element_type],
        status: p.status, // 'a','d','i','s','n'
        chance_of_playing_next_round: p.chance_of_playing_next_round,
        news: p.news,
        now_cost: p.now_cost,
        price_label: priceLabel(p.now_cost),
        selected_by_percent: p.selected_by_percent,
        form: p.form,
        points_per_game: p.points_per_game,
        total_points: p.total_points,
      };

      return { content: [{ type: "text", text: JSON.stringify(info) }] };
    }
  );

  // 3) (kept) top_by_price — unchanged
  server.registerTool(
    "top_by_price",
    {
      title: "Top N by price within a position",
      description: "List the most expensive players for a given position using cached bootstrap.",
      inputSchema: TopByPriceInput,
    },
    async (input) => {
      const args = z.object(TopByPriceInput).parse(input);
      const boot = await getBootstrapCached({ allowStale: true });
      const rows = topByPrice(boot, Number(args.position), args.limit).map((p: any) => ({
        id: p.id,
        name: p.web_name,
        team: teamShort(boot, p.team),
        position: POSITION_ID_TO_SHORT[p.element_type],
        price: priceLabel(p.now_cost),
        total_points: p.total_points,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ position: args.position, rows }) }] };
    }
  );

  // 4) (kept) refresh_bootstrap — unchanged
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              fetchedAt: new Date(env.fetchedAt).toISOString(),
              elements: env.payload.elements?.length ?? 0,
              teams: env.payload.teams?.length ?? 0,
              events: env.payload.events?.length ?? 0,
            }),
          },
        ],
      };
    }
  );
}
