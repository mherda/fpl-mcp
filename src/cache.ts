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

export async function setBootstrap(payload: any) {
  const envelope = { payload, fetchedAt: Date.now() };
  await kv.set(KEY, JSON.stringify(envelope), { ex: TTL_SECONDS * 2 });
  return envelope;
}

export async function getBootstrapCached(opts: { allowStale?: boolean } = {}) {
  const raw = await kv.get<string>(KEY);
  if (raw) {
    const env = JSON.parse(raw) as { payload: any; fetchedAt: number };
    const fresh = (Date.now() - env.fetchedAt) / 1000 < TTL_SECONDS;
    if (fresh) return env.payload;
    if (opts.allowStale !== false) {
      if (!inflight) inflight = fetchUpstream().then(setBootstrap).finally(() => (inflight = null));
      return env.payload; // serve stale, refresh in background
    }
  }
  if (!inflight) inflight = fetchUpstream().then(setBootstrap).finally(() => (inflight = null));
  return (await inflight).payload;
}

// Tiny utils for tools
export const ElementTypeId = { GOALKEEPER: 1, DEFENDER: 2, MIDFIELDER: 3, FORWARD: 4 } as const;
export const priceLabel = (now_cost: number) => `£${(now_cost / 10).toFixed(1)}m`;
export const teamShort = (boot: any, id: number) => boot.teams.find((t: any) => t.id === id)?.short_name ?? `T${id}`;
export const findPlayerById = (boot: any, id: number) => boot.elements.find((p: any) => p.id === id);
export const fuzzyFindPlayerByName = (boot: any, q: string) => {
  const n = (s: string) => s.toLowerCase();
  const list = boot.elements.filter((p: any) =>
    n(p.web_name).includes(n(q)) || n(`${p.first_name} ${p.second_name}`).includes(n(q)));
  return list.sort((a: any, b: any) => (n(a.web_name) === n(q) ? -1 : 1))[0];
};
export const topByPrice = (boot: any, pos: number, n = 10) =>
  boot.elements
    .filter((p: any) => p.element_type === pos)
    .sort((a: any, b: any) => b.now_cost - a.now_cost || b.total_points - a.total_points)
    .slice(0, n);
