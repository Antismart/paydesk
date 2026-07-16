/**
 * Deterministic payout-route comparison.
 *
 * The model never computes these numbers. It only narrates the result returned
 * here, so a hallucinated rate cannot reach a user. Every figure traces to
 * rails.json (curated, dated) or a timestamped FX quote.
 */

import railsData from "./data/rails.json" with { type: "json" };
import { getRate, type FxQuote } from "./data/fx.js";

export type Rail = {
  id: string;
  name: string;
  kind: "stablecoin" | "traditional";
  fee_pct: number;
  fee_flat_usd: number;
  arrival: string;
  caveats: string[];
};

export type RouteOption = {
  rail: string;
  rail_id: string;
  kind: Rail["kind"];
  est_fee_pct: number;
  est_fee_abs: number;
  est_net: number;
  est_arrival: string;
  caveats: string[];
};

export type RouteComparison = {
  amount: number;
  currency: string;
  corridor: string;
  routes: RouteOption[];
  recommended: string;
  savings_vs_worst: number;
  fx: FxQuote | null;
  data_warning: string | null;
  disclosure: string;
};

const RAILS = railsData.rails as Rail[];
const CORRIDORS = railsData.corridors as Record<
  string,
  { note: string; remittance_fee_pct_override?: number }
>;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Corridor overrides only apply to the remittance rail: wire and card fees are
 * broadly flat across corridors, but remittance pricing is corridor-specific.
 */
function effectiveFeePct(rail: Rail, corridor: string): number {
  if (rail.id !== "remittance_corridor") return rail.fee_pct;
  return CORRIDORS[corridor]?.remittance_fee_pct_override ?? rail.fee_pct;
}

export async function compareRoutes(input: {
  amount: number;
  currency?: string;
  payer_country?: string;
  payee_country?: string;
}): Promise<RouteComparison> {
  const amount = input.amount;
  const currency = (input.currency ?? "USD").toUpperCase();
  const payer = (input.payer_country ?? "US").toUpperCase();
  const payee = (input.payee_country ?? "KE").toUpperCase();
  const corridor = `${payer}-${payee}`;

  const warnings: string[] = [];

  if (!(corridor in CORRIDORS)) {
    warnings.push(
      `No curated data for corridor ${corridor}; using default remittance averages.`,
    );
  }

  // FX is informational for the payee's local view. Fees are charged on the
  // invoice currency, so the comparison itself does not depend on the rate.
  let fx: FxQuote | null = null;
  if (currency !== "USD") {
    fx = await getRate(currency, "USD");
    if (fx.source === "unavailable") {
      warnings.push(
        `FX rate for ${currency}/USD is unavailable; fee percentages are still exact but the USD equivalent is omitted.`,
      );
    } else if (fx.stale) {
      warnings.push(
        `FX rate for ${currency}/USD is cached from ${fx.as_of} and may be stale.`,
      );
    }
  }

  const routes: RouteOption[] = RAILS.map((rail) => {
    const pct = effectiveFeePct(rail, corridor);
    const fee = round2(amount * pct + rail.fee_flat_usd);
    return {
      rail: rail.name,
      rail_id: rail.id,
      kind: rail.kind,
      est_fee_pct: round2((fee / amount) * 100),
      est_fee_abs: fee,
      est_net: round2(amount - fee),
      est_arrival: rail.arrival,
      caveats: rail.caveats,
    };
  }).sort((a, b) => a.est_fee_abs - b.est_fee_abs);

  const best = routes[0];
  const worst = routes[routes.length - 1];
  if (!best || !worst) {
    throw new Error("rails.json contains no rails; cannot compare routes.");
  }

  return {
    amount,
    currency,
    corridor,
    routes,
    recommended: best.rail_id,
    savings_vs_worst: round2(worst.est_fee_abs - best.est_fee_abs),
    fx,
    data_warning: warnings.length ? warnings.join(" ") : null,
    disclosure: railsData._meta.label,
  };
}
