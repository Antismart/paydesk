# PayDesk

Get paid globally, keep more of it.

PayDesk is an A2MCP agent service for cross-border freelance invoicing and payout routing. It
turns a plain-language billing request into a client-ready invoice with a hosted payment link,
and ranks the ways a freelancer can actually receive the money, comparing stablecoin and
traditional rails by estimated fee and arrival time.

The primary consumer is another agent, not a browser. The web interface is a second front door
onto the same functions, and the hosted invoice page is a client-facing artifact the tools
produce.

Live: https://paydesk-production.up.railway.app

## Design boundaries

Three rules shape the codebase. They are worth stating before the API surface, because most of
the structure follows from them.

**PayDesk never holds, moves, or settles funds.** It recommends a rail and generates payment
instructions. Money moves directly between client and freelancer. Nothing in the store records a
balance, and the `paid` flag is something a user sets by hand, not a settlement the service
observed.

**Models write prose, code computes numbers.** Every fee figure is computed by
`src/routes-engine.ts` from a dated, curated rail table and a timestamped FX quote. The Routes
agent receives a finished comparison object and only narrates it. It is never handed the
arithmetic, so a hallucinated rate cannot reach a user.

**Staleness is disclosed, never hidden.** FX quotes carry `as_of`, `stale`, and `source` fields,
and callers are expected to surface them. The service does not invent a rate when one is
unavailable.

## API surface

Five tools are exposed over MCP at `POST /mcp`.

| Tool | Price (USD) | Required input | Optional input |
| --- | --- | --- | --- |
| `compare_payout_routes` | Free | `amount` (number) | `currency`, `payer_country`, `payee_country` |
| `create_invoice` | Free for first 3, then 0.50 | `request` (string) | `payer_country`, `payee_country` |
| `draft_payment_followups` | 0.25 | `invoice_id` (string) | |
| `summarize_income` | 0.25 | | `period` (string) |
| `mark_invoice_paid` | Free | `invoice_id` (string) | |

`compare_payout_routes` is deliberately free. It is the discovery hook, so any agent can find and
evaluate PayDesk without holding a wallet. Discovery calls (`initialize`, `tools/list`) are never
gated.

## HTTP endpoints

A single Express process serves both the agent surface and the browser surface.

| Path | Method | Purpose |
| --- | --- | --- |
| `/mcp` | POST | A2MCP tool surface, x402 gated |
| `/` | GET | Operator web interface |
| `/i/:id` | GET | Hosted client-facing invoice page |
| `/api/*` | POST | REST surface backing the web interface |
| `/health` | GET | Health check, returns `{"ok":true,"service":"paydesk"}` |

Note that `/mcp` is the agent endpoint. The bare root serves the human interface and returns 404
to an MCP payload.

## Payments (x402)

Paid tools return HTTP 402 with a base64 `PAYMENT-REQUIRED` challenge. The caller replays with
`PAYMENT-SIGNATURE` (legacy `X-PAYMENT` is also accepted), and settlement is reported back in
`PAYMENT-RESPONSE`. The wire format follows OKX Onchain OS Payments (x402 v2).

Verification and settlement are delegated to the OKX facilitator. Payment requirements are always
constructed server side and never echoed from the caller payload, so a caller cannot name its own
price.

Settlement runs on X Layer (`eip155:196`). The asset uses 6 decimals, confirmed against
`decimals()` on chain via two independent RPC endpoints on 2026-07-16, so a 0.25 USD call quotes
as `250000`.

If the OKX credentials are absent, the process exits at startup rather than degrading to serving
paid tools for free.

## Requirements

Node 22 or later.

## Quick start

```bash
npm install
cp .env.example .env   # then fill in the required values
npm run dev            # tsx watch on src/server.ts
```

Scripts:

| Command | Effect |
| --- | --- |
| `npm run dev` | Development server with file watching |
| `npm start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Backs the five agents |
| `OKX_PAY_API_KEY` | Yes | OKX facilitator credential |
| `OKX_PAY_SECRET_KEY` | Yes | OKX facilitator credential |
| `OKX_PAY_PASSPHRASE` | Yes | OKX facilitator credential |
| `PAYDESK_PAYOUT_ADDRESS` | Yes | Destination for settled funds. Required at startup |
| `PAYDESK_PUBLIC_URL` | In production | Base URL for minting invoice links. A wrong value produces dead client links |
| `PAYDESK_DATA_DIR` | In production | Invoice store location. Point at a mounted volume |
| `PAYDESK_BANK_DETAILS` | No | Bank payment instructions |
| `PORT` | No | Defaults to 8080 |
| `X402_ASSET_DECIMALS` | No | Defaults to 6, which is verified correct for the current asset |
| `PAYDESK_DEMO_STUB` | No | Local UI development only. Never set in production |

## Project structure

```
src/
  server.ts          A2MCP tool surface and process entry point
  api.ts             REST surface backing the web interface
  x402.ts            Payment gate, pricing, facilitator calls
  routes-engine.ts   Deterministic fee and route comparison
  config.ts          Constants shared by both front doors
  store.ts           JSON invoice store
  web-ui.ts          Operator interface
  invoice-page.ts    Hosted client-facing invoice
  demo-stub.ts       Canned agent output for offline UI work
  agents/
    client.ts        Anthropic client and output schemas
    index.ts         The five agents
  data/
    rails.json       Curated rail fee table with corridor overrides
    fx.ts            FX rates with hourly cache and staleness contract
```

## Storage

Invoices persist to a JSON file, which is the simplest thing that survives a restart. In
production, set `PAYDESK_DATA_DIR` to a mounted volume. A container filesystem is ephemeral, and
without a volume every invoice is lost on redeploy.

## Demo stub

`src/demo-stub.ts` returns canned agent output for offline interface work, and is selected at
import time by `PAYDESK_DEMO_STUB=1`.

It is never a fallback. A failed agent call still fails loudly. It never touches the numbers,
since route comparison is deterministic and needs no credits, so fee math runs for real on the
stub path as well. It announces itself with a startup banner, and every stubbed response carries
`stub: true`, which the interface renders as a visible badge.

## Deployment

Railway, built with Nixpacks. `railway.json` defines the start command, a `/health` check, and an
on-failure restart policy. A persistent volume must be mounted at the path given in
`PAYDESK_DATA_DIR`.

## Data and limitations

Rail figures are hand-curated estimates from published provider fee schedules and World Bank
Remittance Prices Worldwide corridor averages, dated in `rails.json`. They are typical figures,
not quotes, and not guarantees.

Comparisons exclude costs that are disclosed as rail caveats rather than netted out of the
headline figure. Stablecoin off-ramp to local currency may add 0.5 to 2 percent. Wire and card
rails carry an FX spread on top of the stated fee.
