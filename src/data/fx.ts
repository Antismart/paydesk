/**
 * FX rates with an hourly cache and an explicit staleness contract.
 *
 * Callers must surface `stale` and `as_of` to the user. Per spec section 5 P0-3
 * and the Routes agent contract, we never silently serve a rate without saying
 * how old it is, and we never invent one.
 */

export type FxQuote = {
  base: string;
  quote: string;
  rate: number;
  as_of: string;
  stale: boolean;
  source: "live" | "cache" | "unavailable";
};

const TTL_MS = 60 * 60 * 1000;

type CacheEntry = { rate: number; as_of: number };
const cache = new Map<string, CacheEntry>();

function key(base: string, quote: string) {
  return `${base.toUpperCase()}:${quote.toUpperCase()}`;
}

export async function getRate(base: string, quote: string): Promise<FxQuote> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();

  if (b === q) {
    return {
      base: b,
      quote: q,
      rate: 1,
      as_of: new Date().toISOString(),
      stale: false,
      source: "live",
    };
  }

  const k = key(b, q);
  const hit = cache.get(k);
  const fresh = hit && Date.now() - hit.as_of < TTL_MS;

  if (fresh) {
    return {
      base: b,
      quote: q,
      rate: hit.rate,
      as_of: new Date(hit.as_of).toISOString(),
      stale: false,
      source: "cache",
    };
  }

  try {
    const url = `https://api.exchangerate.host/live?source=${b}&currencies=${q}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`fx http ${res.status}`);
    const body = (await res.json()) as {
      success?: boolean;
      quotes?: Record<string, number>;
    };
    const rate = body?.quotes?.[`${b}${q}`];
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      throw new Error("fx payload missing rate");
    }
    cache.set(k, { rate, as_of: Date.now() });
    return {
      base: b,
      quote: q,
      rate,
      as_of: new Date().toISOString(),
      stale: false,
      source: "live",
    };
  } catch {
    // Spec section 4 edge case: FX API down -> serve cache with a timestamp
    // warning. If we have never seen this pair, say so rather than guess.
    if (hit) {
      return {
        base: b,
        quote: q,
        rate: hit.rate,
        as_of: new Date(hit.as_of).toISOString(),
        stale: true,
        source: "cache",
      };
    }
    return {
      base: b,
      quote: q,
      rate: NaN,
      as_of: new Date().toISOString(),
      stale: true,
      source: "unavailable",
    };
  }
}
