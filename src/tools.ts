// src/tools.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getBootstrapCached, findPlayerById, fuzzyFindPlayerByName,
  priceLabel, teamShort, topByPrice
} from "./cache.js";

/* ---------- Define shapes (not z.object) ---------- */

const GetPlayerPriceInput = {
  id: z.number().int().positive().optional(),
  name: z.string().min(2).optional(),
} as const;

const TopByPriceInput = {
  position: z.enum(["1", "2", "3", "4"]).describe("1=GKP, 2=DEF, 3=MID, 4=FWD"),
  limit: z.number().int().min(1).max(50).default(10),
} as const;

const RefreshBootstrapInput = {} as const;

/* ---------- Register tools ---------- */

export function registerFplTools(server: McpServer) {
  // get_player_price
  server.registerTool(
    "get_player_price",
    {
      title: "Get player current price",
      description: "Return a player's current price and basic info from cached FPL bootstrap.",
      inputSchema: GetPlayerPriceInput, // <- raw shape
    },
    async (input) => {
      // runtime validation + custom rule: require id or name
      const parsed = z.object(GetPlayerPriceInput).safeParse(input);
      if (!parsed.success) {
        return { isError: true, content: [{ type: "text", text: parsed.error.message }] };
      }
      const { id, name } = parsed.data;
      if (!id && !name) {
        return { isError: true, content: [{ type: "text", text: "Provide either id or name." }] };
      }

      const boot = await getBootstrapCached({ allowStale: true });
      const p = id ? findPlayerById(boot, id) : fuzzyFindPlayerByName(boot, name!);
      if (!p) return { isError: true, content: [{ type: "text", text: "Player not found" }] };

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: p.id,
            name: p.web_name,
            team: teamShort(boot, p.team),
            position: p.element_type,     // 1..4
            now_cost: p.now_cost,         // tenths of £m
            price_label: priceLabel(p.now_cost),
            selected_by_percent: p.selected_by_percent,
            status: p.status,
          })
        }]
      };
    }
  );

  // top_by_price
  server.registerTool(
    "top_by_price",
    {
      title: "Top N by price within a position",
      description: "List the most expensive players for a given position using cached bootstrap.",
      inputSchema: TopByPriceInput, // <- raw shape
    },
    async (input) => {
      const parsed = z.object(TopByPriceInput).parse(input);
      const boot = await getBootstrapCached({ allowStale: true });
      const rows = topByPrice(boot, Number(parsed.position), parsed.limit).map((p: any) => ({
        id: p.id, name: p.web_name, team: teamShort(boot, p.team),
        price: priceLabel(p.now_cost), total_points: p.total_points
      }));
      return { content: [{ type: "text", text: JSON.stringify({ position: parsed.position, rows }) }] };
    }
  );

  // refresh_bootstrap
  server.registerTool(
    "refresh_bootstrap",
    {
      title: "Force refresh bootstrap cache",
      description: "Fetch bootstrap and refresh KV.",
      inputSchema: RefreshBootstrapInput, // <- raw shape
    },
    async () => {
      const { fetchUpstream, setBootstrap } = await import("./cache.js");
      const env = await fetchUpstream().then(setBootstrap);
      return {
        content: [{ type: "text", text: JSON.stringify({
          fetchedAt: new Date(env.fetchedAt).toISOString(),
          elements: env.payload.elements?.length ?? 0,
          teams: env.payload.teams?.length ?? 0,
          events: env.payload.events?.length ?? 0,
        })}]
      };
    }
  );
}
