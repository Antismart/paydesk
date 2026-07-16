/**
 * REST surface for the browser.
 *
 * This is a second front door onto the same building. Every endpoint here calls
 * the exact functions the MCP tools in server.ts call — `intake()`,
 * `compareRoutes()`, `routeRationale()`, `invoiceText()`, `store.save()`. None
 * of the parsing or fee arithmetic is reimplemented, because a demo that can
 * drift from the product is a demo of nothing.
 *
 * One deliberate difference from the MCP path: `create_invoice` parses and
 * creates in a single tool call, because the caller there is an agent that can
 * carry a clarifying question back to its user itself. The browser caller
 * cannot, so the flow is split in two — POST /api/intake returns the draft,
 * POST /api/create commits it. The human sees what will be created before it
 * exists (spec P0-1: confirm before create).
 *
 * Mount in server.ts:  app.use(api)
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";

import * as agents from "./agents/index.js";
import { IntakeSchema } from "./agents/client.js";
import { compareRoutes } from "./routes-engine.js";
import * as store from "./store.js";
import { PRICES } from "./x402.js";
import { DEMO_STUB, stubbed } from "./demo-stub.js";
import {
  FREE_INVOICES,
  PAYOUT_STABLECOIN_ADDRESS,
  PAYOUT_BANK_DETAILS,
  PUBLIC_URL,
  addDays,
  today,
} from "./config.js";

export const router: Router = Router();

/**
 * The model-backed agents, or their canned equivalents when PAYDESK_DEMO_STUB=1.
 * Resolved once at import from an explicit flag — never per-request, and never
 * from a catch block. See demo-stub.ts.
 */
const { intake, invoiceText, routeRationale } = DEMO_STUB ? stubbed : agents;

/**
 * The web caller is a single shared identity for v1: there are no accounts yet,
 * so every browser session shares one invoice list and one free-tier counter.
 * The MCP path scopes by agent caller id; this is the web equivalent, and it is
 * the thing to replace first when auth lands.
 */
const WEB_CALLER = "web";

/**
 * Anything the model or the network throws becomes JSON, never a stack trace and
 * never a dead socket. The message is passed through because the failures that
 * actually occur here are operator-actionable ("credit balance is too low") and
 * hiding them behind "something went wrong" wastes the person's time.
 */
function fail(res: import("express").Response, status: number, err: unknown) {
  // The SDK stringifies the whole error envelope into .message, which reaches
  // the page as a wall of JSON. The useful sentence is nested inside, so prefer
  // it when it is there and fall back to the raw message when it is not.
  const nested = (err as { error?: { error?: { message?: unknown } } })?.error?.error?.message;
  const message =
    typeof nested === "string" && nested
      ? nested
      : err instanceof Error
        ? err.message
        : String(err);
  console.error("[api]", message);
  res.status(status).json({ error: "agent_error", message });
}

/** POST /api/intake — parse a request into a draft. Creates nothing. */
router.post("/api/intake", async (req, res) => {
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request) {
    res.status(400).json({ error: "bad_request", message: "A request string is required." });
    return;
  }

  try {
    const draft = await intake(request);
    res.json({ draft, stub: DEMO_STUB });
  } catch (err) {
    fail(res, 502, err);
  }
});

/**
 * POST /api/create — commit a confirmed draft.
 *
 * Mirrors the create_invoice tool in server.ts from the point where parsing is
 * done: same guards, same number allocation, same comparison, same save.
 */
router.post("/api/create", async (req, res) => {
  // The draft round-trips through the browser, so it is re-validated on the way
  // back in. Same schema the model's own output is held to.
  const parsed = IntakeSchema.safeParse(req.body?.draft);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Draft is missing or malformed." });
    return;
  }
  const draft = parsed.data;

  if (draft.out_of_scope) {
    res.status(400).json({
      error: "out_of_scope",
      message: "This does not look like an invoicing request.",
    });
    return;
  }

  // Same gate as the tool: an unanswered question or a missing essential field
  // must not become an invoice.
  if (draft.amount == null || !draft.client_name) {
    res.status(400).json({
      error: "needs_input",
      message: "An amount and a client name are required before an invoice can be created.",
      missing_fields: draft.missing_fields,
    });
    return;
  }

  const payer_country = String(req.body?.payer_country ?? "US").toUpperCase();
  const payee_country = String(req.body?.payee_country ?? "KE").toUpperCase();

  try {
    const used = await store.usageCount(WEB_CALLER);
    const invoice_number = await store.nextInvoiceNumber();
    const id = randomUUID();

    const comparison = await compareRoutes({
      amount: draft.amount,
      currency: draft.currency,
      payer_country,
      payee_country,
    });
    const rationale = await routeRationale(comparison);

    const text = await invoiceText({
      client_name: draft.client_name,
      amount: draft.amount,
      currency: draft.currency,
      invoice_number,
      stablecoin_address: PAYOUT_STABLECOIN_ADDRESS,
      bank_details: PAYOUT_BANK_DETAILS,
    });

    const invoice = await store.save({
      id,
      invoice_number,
      client_name: draft.client_name,
      client_email: draft.client_email,
      amount: draft.amount,
      currency: draft.currency,
      line_items: draft.line_items,
      issue_date: today(),
      due_date: addDays(draft.due_days),
      notes: draft.notes,
      paid: false,
      payment_instructions: text.payment_instructions,
      footer_note: text.footer_note,
      recommended_rail: comparison.recommended,
      fees_saved: comparison.savings_vs_worst,
      created_by: WEB_CALLER,
    });

    res.json({
      invoice,
      invoice_url: `${PUBLIC_URL}/i/${id}`,
      routes: { ...comparison, rationale },
      billing: {
        free_invoices_remaining: Math.max(0, FREE_INVOICES - used - 1),
        price_after_free_tier: `$${PRICES.create_invoice} per invoice`,
      },
      stub: DEMO_STUB,
    });
  } catch (err) {
    fail(res, 502, err);
  }
});

/** GET /api/invoices — this caller's invoices, newest first. */
router.get("/api/invoices", async (_req, res) => {
  try {
    const invoices = await store.list(WEB_CALLER);
    const used = invoices.length;
    res.json({
      invoices: invoices.slice().reverse(),
      billing: {
        free_invoices_remaining: Math.max(0, FREE_INVOICES - used),
        price_after_free_tier: `$${PRICES.create_invoice} per invoice`,
      },
    });
  } catch (err) {
    fail(res, 500, err);
  }
});

export default router;
