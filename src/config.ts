/**
 * Constants and date helpers shared by the two front doors: the A2MCP tool
 * surface (server.ts) and the browser REST surface (api.ts).
 *
 * These live here rather than in server.ts because both callers must agree on
 * them. A free-tier count or payout address that differs between the agent path
 * and the web path is a correctness bug, not a config nicety.
 */

export const FREE_INVOICES = 3;

export const PAYOUT_STABLECOIN_ADDRESS =
  process.env.PAYDESK_PAYOUT_ADDRESS ?? "<set PAYDESK_PAYOUT_ADDRESS>";
export const PAYOUT_BANK_DETAILS =
  process.env.PAYDESK_BANK_DETAILS ?? "<set PAYDESK_BANK_DETAILS>";
export const PORT = Number(process.env.PORT ?? 8080);

/**
 * Base URL used to build the client-facing invoice link. Falls back to the port
 * actually being listened on — a hardcoded default here silently mints dead
 * links whenever PORT differs, and the link is the one thing we hand to a
 * paying client.
 */
export const PUBLIC_URL =
  process.env.PAYDESK_PUBLIC_URL ?? `http://localhost:${PORT}`;

export function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
