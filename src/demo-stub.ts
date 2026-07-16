/**
 * Canned agent responses for offline UI work. OFF unless PAYDESK_DEMO_STUB=1.
 *
 * Why this exists: the three model-backed agents behind the web flow (intake,
 * routeRationale, invoiceText) each cost a live API call, which makes iterating
 * on the success-state layout impossible without credits or a network.
 *
 * The rules this file lives by, and must keep living by:
 *
 *  1. It is NEVER a fallback. It is selected at import time by an explicit env
 *     flag and nothing else. A real agent call that fails still fails loudly —
 *     no catch block anywhere reaches for these values.
 *  2. It never touches the numbers. compareRoutes() is deterministic and needs
 *     no credits, so fee math runs for real on the stub path too. Only prose and
 *     parsing are canned.
 *  3. It announces itself. Boot logs a banner, and every stubbed API response
 *     carries `stub: true`, which the UI renders as a visible badge. Nobody can
 *     look at a stubbed screen and mistake it for a real one.
 *
 * If you are reading this in production, PAYDESK_DEMO_STUB is set and should
 * not be.
 */

import type { intake as realIntake, invoiceText as realInvoiceText } from "./agents/index.js";
import type { RouteComparison } from "./routes-engine.js";

export const DEMO_STUB = process.env.PAYDESK_DEMO_STUB === "1";

if (DEMO_STUB) {
  console.warn(
    "\n  !! PAYDESK_DEMO_STUB=1 — intake, invoiceText and routeRationale are CANNED.\n" +
      "     No model is being called. Responses are marked stub:true.\n" +
      "     Never set this outside local UI development.\n",
  );
}

/** Mimics a plausible parse of the demo request without calling the model. */
const stubIntake: typeof realIntake = async (request: string) => {
  const amountMatch = /(?:\$|USD\s*)([\d,]+(?:\.\d+)?)/i.exec(request);
  const amount = amountMatch?.[1] ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const netMatch = /net\s*(\d{1,3})/i.exec(request);

  // No amount is the interesting branch to be able to demo: it is what proves
  // PayDesk asks instead of guessing.
  if (amount == null) {
    return {
      client_name: null,
      client_email: null,
      amount: null,
      currency: "USD",
      line_items: [],
      due_days: netMatch?.[1] ? Number(netMatch[1]) : 14,
      notes: null,
      missing_fields: ["amount"],
      clarifying_question: "How much should this invoice be for?",
      out_of_scope: false,
    };
  }

  return {
    client_name: "Acme Corp",
    client_email: null,
    amount,
    currency: "USD",
    line_items: [{ description: "API integration", qty: 1, unit_price: amount }],
    due_days: netMatch?.[1] ? Number(netMatch[1]) : 14,
    notes: null,
    missing_fields: [],
    clarifying_question: null,
    out_of_scope: false,
  };
};

const stubInvoiceText: typeof realInvoiceText = async (input) => ({
  payment_instructions: {
    stablecoin: `Send ${input.currency} ${input.amount.toFixed(2)} as USDC on Base to:\n${input.stablecoin_address}\n\nPlease include ${input.invoice_number} in the transaction note.`,
    bank: `${input.bank_details}\n\nReference: ${input.invoice_number}`,
  },
  footer_note:
    "Thank you for your business — it is a pleasure working with you. Any questions about this invoice, just reply and I will sort it out.",
});

const stubRouteRationale = async (comparison: RouteComparison): Promise<string> => {
  const best = comparison.routes[0];
  const worst = comparison.routes[comparison.routes.length - 1];
  if (!best || !worst) return "No routes available to compare.";
  return `${best.rail} costs you ${comparison.currency} ${best.est_fee_abs.toFixed(2)} and lands in ${best.est_arrival}, so you keep ${comparison.currency} ${best.est_net.toFixed(2)} of the ${comparison.currency} ${comparison.amount.toFixed(2)} billed. Taking ${worst.rail} instead would hand over ${comparison.currency} ${comparison.savings_vs_worst.toFixed(2)} more in fees for a slower arrival.`;
};

export const stubbed = {
  intake: stubIntake,
  invoiceText: stubInvoiceText,
  routeRationale: stubRouteRationale,
};
