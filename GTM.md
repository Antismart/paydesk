# PayDesk — Go-To-Market Copy

Target: OKX.AI Genesis Hackathon. Submissions close 2026-07-17 23:59 UTC.

Every claim below was written against the code in `src/`. Anything the code does not do is
not in the copy. Read the **Blockers** section before submitting any of this — three claims
in here are true of the design and not yet true of the build.

---

## 0. Blockers — resolve before this copy ships

These are not editorial notes. They are places where the copy below would become false if
submitted as-is today.

| # | Issue | Where it bites |
|---|-------|----------------|
| 1 | **`src/x402.ts` does not exist.** `server.ts:21` imports `requirePayment` and `PRICES` from it. The server does not boot — `ERR_MODULE_NOT_FOUND`. Per-call pricing ($0.50 / $0.25 / $0.25) is therefore **not implemented**, and neither is the 402 challenge. | Every price in §1. The whole of §2 tweet 4. |
| 2 | **No route serves `/i/:id`.** `server.ts` mints `invoice_url` at line 160 and `express` only registers `/health` and `/mcp`. The "shareable link" resolves to nothing. | "shareable link" in §1 and §3. |
| 3 | **No live ASP URL and no demo video URL yet.** Both are `<PLACEHOLDER>` below. Do not invent them. | §2 tweets 2 and 5. |

What *is* implemented and safe to claim: the free-invoice counter (`FREE_INVOICES = 3`,
`store.usageCount`, `free_invoices_remaining` in the response), all five MCP tools, the
deterministic routes engine, the five agents, FX caching, and per-caller invoice scoping.

---

## 1. OKX.AI ASP Listing Copy

**Name:** PayDesk

**Category:** Finance

**One-line description:**
Cross-border invoicing and payout-route comparison for freelancers — an agent-callable
service that ranks payment rails by real fee cost and writes the invoice.

### Full description

PayDesk is an ASP for agents whose users get paid across borders. It is called by another
agent, not opened in a browser.

Invoke PayDesk when your user says any of: *how should I get paid for this?*, *invoice Acme
$1,200 for the API work, net 14*, *this client is three weeks late*, or *how did I do this
month?*

It does five things:

1. **Ranks payout rails by cost.** Given an amount and a payer/payee country pair, it returns
   every rail ranked by estimated fee, with arrival time, per-rail caveats, net amount, and a
   one-sentence rationale. Rails covered: USDC on Base, USDT on XLayer, SWIFT wire, remittance
   providers, PayPal cross-border. Corridor-specific remittance pricing for US→KE, US→NG,
   US→IN, US→PH, EU→KE, EU→NG; other corridors fall back to a blended average and say so in
   `data_warning`.
2. **Turns a plain-language request into an invoice.** Parses the request, assigns an invoice
   number, computes a due date, writes client-facing payment instructions, and attaches the
   recommended rail. If the amount or the client is missing it asks **one** clarifying question
   rather than guessing — it will never invent an amount, an email, or a client name.
3. **Drafts collections.** Three escalating follow-ups for an overdue invoice — gentle, firm,
   final. No legal threats, no debt-collection language.
4. **Summarizes a period.** Earned, outstanding, overdue count, fees saved by routing, and a
   plain-language narrative, computed only from invoices that caller created.
5. **Records payment status** when the user says so.

**What PayDesk does not do.** It never holds, moves, or settles funds, and has no custody of
anything. It does not detect payments — `mark_invoice_paid` records what the user tells it. No
KYC, no tax advice, no legal advice. It recommends and it drafts; the money moves elsewhere,
between the client and the freelancer directly.

**On the numbers.** Rail fees are hand-curated estimates drawn from publicly published provider
fee schedules and World Bank Remittance Prices Worldwide corridor averages, dated 2026-07-16.
They are typical figures, **not live quotes** — an actual provider may charge more or less. FX
rates are fetched live and cached for one hour; if the FX API is unreachable, PayDesk serves the
last cached rate flagged `stale` with its `as_of` timestamp, and if it has never seen the pair it
returns `unavailable` rather than guessing a rate. Every response carries this disclosure inline.

Arithmetic is done in code, not by a model. The routes engine computes every figure
deterministically from a versioned data file; the model is handed the finished comparison and
allowed only to narrate it. A hallucinated fee cannot reach your user through this path.

### Services and pricing

| Tool | What it returns | Price |
|------|-----------------|-------|
| `compare_payout_routes` | Ranked rails with estimated fees, arrival times, caveats, net amounts, recommendation, rationale | **Free** |
| `create_invoice` | Invoice record, invoice link, route comparison, billing status | **First 3 free, then $0.50** per invoice |
| `draft_payment_followups` | Three staged follow-up emails for an overdue invoice | **$0.25** per call |
| `summarize_income` | Period summary: earned, outstanding, overdue count, fees saved, narrative | **$0.25** per call |
| `mark_invoice_paid` | Records a payment the user reports | **Free** |

Caller identity comes from the `x-paydesk-caller` header; invoices are scoped to their creator
and one caller cannot read another's.

> ⚠️ Blocker 1: these prices are the intended model. `src/x402.ts` is missing, so no price is
> enforced today. Ship the middleware or drop the price column before this listing is submitted.

---

## 2. X Launch Thread

**1/**

A US client pays a Kenyan freelancer $1,200.

Remittance provider: they keep $1,114.80.
USDC on Base: they keep $1,199.99.

Same work. $85.19 difference. Most freelancers never see this comparison, because nothing
puts it in front of them at the moment they invoice.

#OKXAI

> **Fee math, so you can check it.** Straight from `src/data/rails.json` and the
> `compareRoutes()` logic in `src/routes-engine.ts` — `fee = amount × fee_pct + fee_flat_usd`,
> rounded to cents. On $1,200, corridor US-KE:
>
> | Rail | Arithmetic | Fee | Net |
> |------|-----------|-----|-----|
> | USDC on Base | 1200 × 0.0 + 0.01 | $0.01 | $1,199.99 |
> | USDT on XLayer | 1200 × 0.0 + 0.01 | $0.01 | $1,199.99 |
> | SWIFT wire | 1200 × 0.01 + 35.00 | $47.00 | $1,153.00 |
> | PayPal cross-border | 1200 × 0.0499 + 0.49 | $60.37 | $1,139.63 |
> | Remittance provider | 1200 × 0.071 + 0.00 | $85.20 | $1,114.80 |
>
> The remittance rate is the US-KE corridor override (7.1%), not the 6.2% default.
> `savings_vs_worst` = 85.20 − 0.01 = **$85.19**.
>
> These are curated estimates from published fee schedules dated 2026-07-16, not live quotes.
> The off-ramp from USDC to Kenyan shillings costs another 0.5–2%, which is listed as a caveat
> on the rail and is not netted out of the figure above. Wire and PayPal carry FX spread on top.
> The honest comparison is still lopsided; it is not $85.19 lopsided for every user.

**2/**

PayDesk is an agent-callable service that ranks cross-border payout rails by what they actually
cost, then writes the invoice.

90-second demo: `<PLACEHOLDER: demo video URL, ≤90s>`

**3/**

Five agents behind one MCP orchestrator:

— Intake parses "invoice Acme $1,200, net 14" into structured fields, and asks one question
instead of guessing a missing one
— Routes narrates the ranking
— Invoice writes the client-facing text
— Collections drafts three escalating follow-ups
— Ledger summarizes the period

The Routes agent never touches the arithmetic. `routes-engine.ts` computes every fee from a
dated data file and hands the model a finished object to explain. Models write prose, code
computes numbers. That split is the whole reason a fee estimate here is checkable.

**4/**

The business model, plainly:

`compare_payout_routes` is free — it's the hook, and it's the thing worth being known for.
`create_invoice` is free for 3, then $0.50. Follow-ups and income summaries are $0.25.

Free where it builds trust, paid where it saves an hour. The agent calling PayDesk pays
per call; no seats, no subscription, no minimum.

**5/**

Built solo in 3 days for the OKX.AI Genesis Hackathon.

PayDesk never holds, moves, or settles funds — it recommends a rail and drafts the paperwork.
The money moves between client and freelancer directly. That boundary is the design, not a
limitation to fix later.

Live: `<PLACEHOLDER: ASP listing URL>`

#OKXAI

---

## 3. 90-Second Demo Script

Every beat below is producible by the code today, **except** the two flagged as blocked.
Screen is a terminal or an agent client calling the PayDesk MCP endpoint — never a browser
UI, because there isn't one.

| Time | On screen | Voiceover |
|------|-----------|-----------|
| 0:00–0:08 | Agent client, empty prompt. Type: *"I just finished an API integration for Acme, $1,200. How should I get paid? I'm in Nairobi."* | "A freelancer in Nairobi just finished a job for a US client. She asks her agent how to get paid." |
| 0:08–0:22 | Agent calls `compare_payout_routes`. Raw JSON response scrolls: five rails ranked, USDC on Base at $0.01 top, Remittance provider at $85.20 bottom. Hold on `est_net` column. | "PayDesk ranks every rail by what it actually costs her. Remittance takes $85.20 of that $1,200. USDC on Base takes a cent. This call is free." |
| 0:22–0:30 | Zoom the `disclosure` and `caveats` fields in the response. | "These are curated estimates from published fee schedules, not live quotes — and PayDesk says so in every response. The off-ramp caveat is right there too. It isn't selling you the crypto rail; it's showing you the arithmetic." |
| 0:30–0:38 | Type: *"Invoice them, net 14."* Agent calls `create_invoice`. Response returns `status: needs_input` with a clarifying question about the client's email. | "Now the invoice. It doesn't know her client's email — so it asks. One question. It will not invent a field." |
| 0:38–0:50 | Answer. `create_invoice` returns: invoice `PD-0001`, due date, payment instructions with both stablecoin and bank options, recommended rail, and `billing: { free_invoices_remaining: 2 }`. | "Invoice number, due date, payment instructions the client can follow without asking a question, and the recommended rail attached. Two free invoices left, then fifty cents each." |
| 0:50–1:02 | Type: *"Acme still hasn't paid."* Agent calls `draft_payment_followups`. Three drafts render: gentle, firm, final. Hold on the final one. | "Three weeks later, nothing. Three drafts — gentle, firm, final. Read the final one: no legal threats, no collections language. She still wants this client next quarter." |
| 1:02–1:14 | Type: *"How was this month?"* `summarize_income` returns earned, outstanding, overdue count, `fees_saved_estimate`, narrative. | "And the month in plain language. Earned, outstanding, overdue, and what routing well actually saved her." |
| 1:14–1:26 | Split screen: `server.ts` tool list on the left, `routes-engine.ts` `compareRoutes()` on the right. Highlight that the model receives the computed object. | "Five agents, one orchestrator. Every number comes from code against a dated data file — the model only narrates it. PayDesk never holds or moves a cent of this money." |
| 1:26–1:30 | ASP listing URL card. | "PayDesk. On OKX.AI." |

**Script notes**

- **Blocked beat — do not shoot until fixed:** any shot of opening `invoice_url` in a browser.
  Blocker 2 — nothing serves `/i/:id`. The 0:38 beat above deliberately shows the JSON response
  and does not click the link.
- **Blocked beat:** any shot of a 402 challenge or a real charge. Blocker 1 — `x402.ts` is
  missing. The 0:38 voiceover says "then fifty cents each" as a statement of the model, which is
  honest only once the middleware ships. If it doesn't ship by the deadline, cut that clause.
- The `free_invoices_remaining: 2` figure at 0:38 **is** real — it comes from
  `store.usageCount()` and is safe to show.
- Run the demo with a USD invoice, as scripted. FX is only fetched when `currency !== "USD"`
  (`routes-engine.ts:87`), so a USD demo never exercises the FX path — don't narrate FX freshness
  over a shot that isn't doing FX.
- USDC on Base and USDT on XLayer tie at $0.01. The engine picks USDC because it sorts first in
  `rails.json`, not because it beat USDT on merit. Don't voice "USDC wins" — say "the stablecoin
  rails" or show both rows, as the 0:08 beat does.
- Total runtime 90s exactly. If it runs long, cut the 1:02 income-summary beat first; the fee
  comparison and the clarifying question are the two things worth the airtime.
