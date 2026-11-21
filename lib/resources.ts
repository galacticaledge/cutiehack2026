import "server-only";

export function resourcesEnabled(): boolean {
  return Boolean(process.env.KEENABLE_API_KEY);
}

const ALLOW = [
  "khanacademy.org",
  "openstax.org",
  "libretexts.org",
  "mathsisfun.com",
  "wikipedia.org",
  "physicsclassroom.com",
  "tutorial.math.lamar.edu",
];

export interface Link {
  title: string;
  url: string;
  domain: string;
}

const cache = new Map<string, Link[]>();

function allowedDomain(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    return ALLOW.find((d) => host === d || host.endsWith(`.${d}`)) ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** Keenable search for a template's concept query. Never throws; returns [] on error. */
export async function learnMoreLinks(templateId: string, query: string): Promise<Link[]> {
  if (!resourcesEnabled()) return [];
  const hit = cache.get(templateId);
  if (hit) return hit;
  try {
    const base = process.env.KEENABLE_BASE_URL || "https://api.keenable.ai";
    const res = await fetch(`${base}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": process.env.KEENABLE_API_KEY! },
      body: JSON.stringify({ query, max_results: 20 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Keenable ${res.status}`);
    const data = (await res.json()) as { results?: { title?: string; url?: string }[] };
    const links: Link[] = [];
    for (const r of data.results ?? []) {
      if (!r.url) continue;
      const domain = allowedDomain(r.url);
      if (!domain || links.some((l) => l.url === r.url)) continue;
      links.push({ title: String(r.title ?? domain).slice(0, 120), url: r.url, domain });
      if (links.length === 3) break;
    }
    cache.set(templateId, links);
    return links;
  } catch (e) {
    console.warn("[resources] Keenable failed:", (e as Error)?.message);
    return [];
  }
}
