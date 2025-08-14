// src/cache.ts
import { kv } from "@vercel/kv";

const KEY = "fpl:bootstrap:v1";
const TTL_SECONDS = 3600; // 1 hour
let inflight: Promise<any> | null = null;

export async function fetchUpstream(): Promise<any> {
  const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { cache: "no-store" });
  if (!res.ok) throw new Error(`Upstream FPL error: ${res.status}`);
  return res.json();
}

export async function fetchFixtures(): Promise<any> {
  const res = await fetch("https://fantasy.premierleague.com/api/fixtures/", { cache: "no-store" });
  if (!res.ok) throw new Error(`Fixtures API error: ${res.status}`);
  return res.json();
}

export async function setBootstrap(payload: any) {
  const envelope = { payload, fetchedAt: Date.now() };
  await kv.set(KEY, JSON.stringify(envelope), { ex: TTL_SECONDS * 2 });
  return envelope;
}

export async function getBootstrapCached(opts: { allowStale?: boolean } = {}) {
  const raw = await kv.get(KEY);
  
  if (raw) {
    try {
      // Handle different return types from Vercel KV
      let env: { payload: any; fetchedAt: number };
      
      if (typeof raw === "string") {
        env = JSON.parse(raw);
      } else if (typeof raw === "object" && raw !== null) {
        env = raw as { payload: any; fetchedAt: number };
      } else {
        throw new Error(`Unexpected KV data type: ${typeof raw}`);
      }
      
      const fresh = (Date.now() - env.fetchedAt) / 1000 < TTL_SECONDS;
      if (fresh) return env.payload;
      if (opts.allowStale !== false) {
        if (!inflight) inflight = fetchUpstream().then(setBootstrap).finally(() => (inflight = null));
        return env.payload; // serve stale, refresh in background
      }
    } catch (parseError) {
      console.error("Data parsing error:", parseError);
      // Fall through to fetch fresh data
    }
  }
  
  if (!inflight) inflight = fetchUpstream().then(setBootstrap).finally(() => (inflight = null));
  return (await inflight).payload;
}

/* ---------- small lookups ---------- */
export const ElementTypeId = { GOALKEEPER: 1, DEFENDER: 2, MIDFIELDER: 3, FORWARD: 4 } as const;
export const POSITION_ID_TO_SHORT: Record<number, "GKP" | "DEF" | "MID" | "FWD"> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};
export const priceLabel = (now_cost: number) => `£${(now_cost / 10).toFixed(1)}m`;
export const teamShort = (boot: any, id: number) => boot.teams.find((t: any) => t.id === id)?.short_name ?? `T${id}`;
export const findPlayerById = (boot: any, id: number) => boot.elements.find((p: any) => p.id === id);

/* ---------- flexible name search ---------- */

/** Normalize for fuzzy matching: lower-case, strip diacritics, collapse spaces/hyphens. */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string) {
  return norm(s).split(" ").filter(Boolean);
}

/** Score a player against a query; higher is better. */
function matchScore(p: any, qNorm: string, qTokens: string[]) {
  const web = norm(p.web_name);
  const full = norm(`${p.first_name} ${p.second_name}`);
  const last = norm(p.second_name);

  let score = 0;

  // Exact / starts-with bonuses
  if (web === qNorm) score += 100;
  if (full === qNorm) score += 90;
  if (last === qNorm) score += 85;
  if (web.startsWith(qNorm)) score += 60;
  if (last.startsWith(qNorm)) score += 55;
  if (full.startsWith(qNorm)) score += 50;

  // Token coverage
  const hay = `${web} ${full} ${last}`;
  for (const t of qTokens) {
    if (hay.includes(t)) score += 10;
  }

  // Mild popularity tiebreakers (don’t dominate)
  score += Math.min(10, Number.parseFloat(p.selected_by_percent || "0") / 5);
  score += Math.min(10, p.total_points / 50);

  return score;
}

/**
 * Search players by free-text name (surname or any part).
 * Optional filters: position (1..4 or 'GKP'|'DEF'|'MID'|'FWD'), team (id | short | full name).
 */
export function searchPlayers(
  boot: any,
  query: string,
  opts?: { position?: number | "GKP" | "DEF" | "MID" | "FWD"; team?: number | string; limit?: number }
) {
  const qNorm = norm(query);
  const qTokens = tokens(query);
  if (!qNorm) return [];

  // Resolve optional filters
  let positionId: number | undefined;
  if (typeof opts?.position === "number") positionId = opts.position;
  if (typeof opts?.position === "string") {
    positionId = { GKP: 1, DEF: 2, MID: 3, FWD: 4 }[opts.position];
  }

  let teamId: number | undefined;
  if (typeof opts?.team === "number") teamId = opts.team;
  if (typeof opts?.team === "string") {
    const t = boot.teams.find(
      (x: any) => norm(x.short_name) === norm(opts.team as string) || norm(x.name) === norm(opts.team as string)
    );
    teamId = t?.id;
  }

  const filtered = boot.elements.filter((p: any) => {
    if (positionId && p.element_type !== positionId) return false;
    if (teamId && p.team !== teamId) return false;
    return true;
  });

  const ranked = filtered
    .map((p: any) => ({ p, score: matchScore(p, qNorm, qTokens) }))
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score || b.p.total_points - a.p.total_points)
    .map((x: any) => x.p);

  const limit = Math.max(1, opts?.limit ?? 10);
  return ranked.slice(0, limit);
}

/** Convenience: first best match for a name. */
export function resolvePlayerByName(boot: any, name: string) {
  return searchPlayers(boot, name, { limit: 1 })[0] ?? null;
}

/** Keep the previous utility for price tables. */
export const topByPrice = (boot: any, pos: number, n = 10) =>
  boot.elements
    .filter((p: any) => p.element_type === pos)
    .sort((a: any, b: any) => b.now_cost - a.now_cost || b.total_points - a.total_points)
    .slice(0, n);

/**
 * Get fixture difficulty for teams over the next N gameweeks
 */
export async function getFixtureDifficulty(teamIds?: number[], gameweeks: number = 3) {
  try {
    const [bootstrap, fixtures] = await Promise.all([
      getBootstrapCached({ allowStale: true }),
      fetchFixtures()
    ]);

    // Find current gameweek
    const currentEvent = bootstrap.events.find((event: any) => event.is_current || event.is_next);
    const startEvent = currentEvent?.id || 1;
    const endEvent = startEvent + gameweeks - 1;

    // Filter fixtures for the next N gameweeks
    const upcomingFixtures = fixtures.filter((fixture: any) => 
      fixture.event >= startEvent && 
      fixture.event <= endEvent &&
      fixture.finished === false
    );

    // Group by team
    const teamFixtures: Record<number, any[]> = {};
    
    upcomingFixtures.forEach((fixture: any) => {
      // Home team
      if (!teamFixtures[fixture.team_h]) teamFixtures[fixture.team_h] = [];
      teamFixtures[fixture.team_h].push({
        event: fixture.event,
        opponent: fixture.team_a,
        isHome: true,
        difficulty: fixture.team_h_difficulty,
        kickoffTime: fixture.kickoff_time
      });

      // Away team  
      if (!teamFixtures[fixture.team_a]) teamFixtures[fixture.team_a] = [];
      teamFixtures[fixture.team_a].push({
        event: fixture.event,
        opponent: fixture.team_h,
        isHome: false,
        difficulty: fixture.team_a_difficulty,
        kickoffTime: fixture.kickoff_time
      });
    });

    // Filter by requested teams if specified
    if (teamIds && teamIds.length > 0) {
      const filtered: Record<number, any[]> = {};
      teamIds.forEach(id => {
        if (teamFixtures[id]) filtered[id] = teamFixtures[id];
      });
      return { teamFixtures: filtered, gameweeks: { start: startEvent, end: endEvent } };
    }

    return { teamFixtures, gameweeks: { start: startEvent, end: endEvent } };
  } catch (error) {
    console.error("Failed to fetch fixture difficulty:", error);
    throw error;
  }
}
