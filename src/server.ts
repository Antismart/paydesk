/**
 * PayDesk A2MCP service.
 *
 * The five agents of spec section 6 surface here as MCP tools. The consumer is
 * another agent, not a browser — the web invoice link is a client-facing
 * artifact these tools produce, not the product surface.
 *
 * Boundary that must not erode (spec section 3): PayDesk recommends routes and
 * generates payment instructions. It never holds, moves, or settles funds.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { intake, invoiceText, routeRationale, collections, ledger } from "./agents/index.js";
import { compareRoutes } from "./routes-engine.js";
import * as store from "./store.js";
import { requirePayment, PRICES } from "./x402.js";
import invoicePage from "./invoice-page.js";
import api from "./api.js";
import webUi from "./web-ui.js";
import {
  FREE_INVOICES,
  PAYOUT_STABLECOIN_ADDRESS,
  PAYOUT_BANK_DETAILS,
  PUBLIC_URL,
  PORT,
  addDays,
  today,
} from "./config.js";

function buildServer(caller: string) {
  const server = new McpServer({ name: "paydesk", version: "0.1.0" });

  server.tool(
    "compare_payout_routes",
    "Compare ways a freelancer can receive a cross-border payment. Call this when someone asks how to get paid, which rail is cheapest, or how much a payment method will cost them. Returns ranked options with estimated fees and arrival times, plus a recommendation. Free.",
    {
      amount: z.number().positive().describe("Amount to be received"),
      currency: z.string().default("USD").describe("ISO-4217 currency of the amount"),
      payer_country: z.string().default("US").describe("ISO-3166 country the payer sends from"),
      payee_country: z.string().default("KE").describe("ISO-3166 country the freelancer receives in"),
    },
    async (args) => {
      const comparison = await compareRoutes(args);
      const rationale = await routeRationale(comparison);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...comparison, rationale }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_invoice",
    "Turn a plain-language invoicing request into a professional invoice with a shareable link and payout-route recommendation. Call this when someone wants to bill a client, e.g. 'invoice Acme $1,200 for the API integration, net 14'. Asks one clarifying question rather than guessing a missing amount or client. First 3 invoices free, then charged per invoice.",
    {
      request: z
        .string()
        .describe("The invoicing request in plain language, as the user phrased it"),
      payer_country: z.string().default("US").describe("ISO-3166 country the client pays from"),
      payee_country: z.string().default("KE").describe("ISO-3166 country the freelancer receives in"),
    },
    async (args) => {
      const parsed = await intake(args.request);

      if (parsed.out_of_scope) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "out_of_scope",
                message: "This does not look like an invoicing request.",
              }),
            },
          ],
        };
      }

      // Spec section 4: ambiguous intake asks one question, never guesses — but
      // only the truly required fields block. amount and client_name are the
      // minimum needed to draft an invoice; client_email is optional (a link is
      // produced regardless), so a missing email must not stall the invoice.
      if (parsed.amount == null || !parsed.client_name) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "needs_input",
                missing_fields: parsed.missing_fields,
                clarifying_question:
                  parsed.clarifying_question ??
                  "What amount should this invoice be for, and who is it going to?",
                parsed_so_far: parsed,
              }),
            },
          ],
        };
      }

      // Kept sequential on purpose: both touch the same JSON store file, and
      // nextInvoiceNumber writes it. Running them concurrently races a read
      // against that write. They are local and fast, so there is nothing to gain
      // — the latency win is in the two model calls below, which are independent.
      const used = await store.usageCount(caller);
      const invoice_number = await store.nextInvoiceNumber();
      const id = randomUUID();

      // The two model calls are independent: the invoice text does not depend on
      // the route comparison. Overlap them (routeRationale after its comparison,
      // invoiceText alongside) so wall-clock is one call deep, not three.
      const routesTask = compareRoutes({
        amount: parsed.amount,
        currency: parsed.currency,
        payer_country: args.payer_country,
        payee_country: args.payee_country,
      }).then(async (comparison) => ({
        comparison,
        rationale: await routeRationale(comparison),
      }));

      const textTask = invoiceText({
        client_name: parsed.client_name,
        amount: parsed.amount,
        currency: parsed.currency,
        invoice_number,
        stablecoin_address: PAYOUT_STABLECOIN_ADDRESS,
        bank_details: PAYOUT_BANK_DETAILS,
      });

      const [{ comparison, rationale }, text] = await Promise.all([routesTask, textTask]);

      const invoice = await store.save({
        id,
        invoice_number,
        client_name: parsed.client_name,
        client_email: parsed.client_email,
        amount: parsed.amount,
        currency: parsed.currency,
        line_items: parsed.line_items,
        issue_date: today(),
        due_date: addDays(parsed.due_days),
        notes: parsed.notes,
        paid: false,
        payment_instructions: text.payment_instructions,
        footer_note: text.footer_note,
        recommended_rail: comparison.recommended,
        fees_saved: comparison.savings_vs_worst,
        created_by: caller,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                invoice,
                invoice_url: `${PUBLIC_URL}/i/${id}`,
                routes: { ...comparison, rationale },
                billing: {
                  free_invoices_remaining: Math.max(0, FREE_INVOICES - used - 1),
                  price_after_free_tier: `$${PRICES.create_invoice} per invoice`,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "draft_payment_followups",
    "Draft three escalating follow-up emails for an overdue invoice, staged gentle to firm to final. Call this when a client has not paid and the freelancer wants to chase without damaging the relationship.",
    { invoice_id: z.string().describe("The id returned by create_invoice") },
    async ({ invoice_id }) => {
      const invoice = await store.get(invoice_id);
      if (!invoice || invoice.created_by !== caller) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "invoice_not_found" }) }],
        };
      }

      const daysOverdue = Math.floor(
        (Date.parse(today()) - Date.parse(invoice.due_date)) / 86_400_000,
      );

      const { drafts } = await collections({
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        amount: invoice.amount,
        currency: invoice.currency,
        due_date: invoice.due_date,
        days_overdue: daysOverdue,
        payment_link: `${PUBLIC_URL}/i/${invoice.id}`,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ invoice_number: invoice.invoice_number, days_overdue: daysOverdue, drafts }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "summarize_income",
    "Summarize a freelancer's invoice history in plain language: earned, outstanding, overdue count, and fees saved by routing well. Call this for a monthly or period business summary.",
    { period: z.string().default("this month").describe("Human description of the period") },
    async ({ period }) => {
      const invoices = await store.list(caller);
      const summary = await ledger({
        period,
        invoices: invoices.map((i) => ({
          amount: i.amount,
          currency: i.currency,
          status: i.paid ? "paid" : "outstanding",
          due_date: i.due_date,
          fees_saved: i.fees_saved ?? undefined,
        })),
      });
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    "mark_invoice_paid",
    "Mark an invoice as paid. PayDesk does not detect payments — this records what the freelancer tells it.",
    { invoice_id: z.string().describe("The id returned by create_invoice") },
    async ({ invoice_id }) => {
      const invoice = await store.markPaid(invoice_id, caller);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              invoice
                ? { status: "paid", invoice_number: invoice.invoice_number }
                : { error: "invoice_not_found" },
            ),
          },
        ],
      };
    },
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "paydesk" }));

// Client-facing invoice link. Public and unpaid by design: the freelancer's
// client must be able to open it without an agent or a wallet.
app.use(invoicePage);

// REST endpoints for the browser. Same agents and same route engine as the
// tools above — the web path cannot drift from the product.
app.use(api);

// The operator-facing desk. Matches only "/", so it shadows neither /health,
// /i/:id, /api/* nor /mcp.
app.use(webUi);

// Paid tools return a 402 challenge here before any model call is made.
app.use("/mcp", requirePayment({ freeInvoices: FREE_INVOICES }));

app.post("/mcp", async (req, res) => {
  const caller = (req.header("x-paydesk-caller") ?? req.ip ?? "anonymous").toString();
  const server = buildServer(caller);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Never let a stray async error take the whole endpoint down silently. A
// marketplace review that hits an unreachable service reads it as a failed
// agent (this bit us once already). Log the reason so it is visible in the
// host's logs; keep serving on an isolated rejection, restart on a truly
// uncaught fault so the host brings back a clean process.
process.on("unhandledRejection", (reason) => {
  console.error("[paydesk] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[paydesk] uncaughtException:", err);
  // The process state is undefined after this — exit and let the host restart.
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`PayDesk A2MCP listening on :${PORT}`);
  console.log(`Invoice links will be minted as ${PUBLIC_URL}/i/<id>`);
});
