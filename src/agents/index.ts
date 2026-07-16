/**
 * The five agents from spec section 6. Each takes structured input and returns
 * a validated object.
 *
 * Division of labour: models write prose, code computes numbers. The Routes
 * agent here only narrates a comparison that routes-engine.ts already computed
 * — it is never handed the arithmetic.
 */

import {
  ask,
  IntakeSchema,
  InvoiceTextSchema,
  RouteNarrativeSchema,
  CollectionsSchema,
  LedgerSchema,
} from "./client.js";
import type { RouteComparison } from "../routes-engine.js";

export async function intake(request: string) {
  return ask({
    schema: IntakeSchema,
    effort: "low",
    system: `You parse freelancer invoicing requests into structured data.

Never invent an amount, an email address, or a client name. If the request does
not state one, leave the field null and name it in missing_fields. When anything
is missing, write exactly one clarifying_question covering the most important gap.

Default currency to USD. Default due_days to 14 only when the user implies
standard terms; otherwise use what they state.

If the request is not about creating an invoice, set out_of_scope to true and
leave the other fields at their empty values.`,
    user: request,
  });
}

export async function invoiceText(input: {
  client_name: string;
  amount: number;
  currency: string;
  invoice_number: string;
  stablecoin_address: string;
  bank_details: string;
}) {
  return ask({
    schema: InvoiceTextSchema,
    effort: "low",
    system: `You write the client-facing text on a professional invoice.

Tone: professional, warm, no jargon. Never give legal or tax advice. Write
payment instructions the client can follow without asking a question. Keep the
footer note to one or two sentences.`,
    user: JSON.stringify(input),
  });
}

/**
 * Narrates a comparison that was already computed. The model sees the final
 * numbers and explains the ranking; it does not produce or adjust any figure.
 */
export async function routeRationale(comparison: RouteComparison) {
  const { rationale } = await ask({
    schema: RouteNarrativeSchema,
    effort: "low",
    system: `You explain a payout-route recommendation to a freelancer in one or
two sentences.

The comparison you are given is authoritative and already calculated. Use only
the figures present in it. Never state a fee, percentage, or arrival time that
does not appear in the data. If data_warning is set, mention the limitation
plainly rather than glossing over it.

Lead with why the recommended rail wins, in money the freelancer keeps.`,
    user: JSON.stringify(comparison),
  });
  return rationale;
}

export async function collections(invoice: {
  invoice_number: string;
  client_name: string;
  amount: number;
  currency: string;
  due_date: string;
  days_overdue: number;
  payment_link: string;
}) {
  return ask({
    schema: CollectionsSchema,
    effort: "medium",
    system: `You draft payment follow-ups for an overdue invoice.

Produce exactly three drafts, staged gentle, firm, and final — roughly day 1,
day 7, and day 14 past due.

Never threaten legal action or mention debt collection. The relationship must
survive every draft, including the final one. Reference the invoice number,
amount, and due date. Keep each body under 120 words. Include the payment link
in every draft.`,
    user: JSON.stringify(invoice),
  });
}

export async function ledger(history: {
  period: string;
  invoices: Array<{
    amount: number;
    currency: string;
    status: string;
    due_date: string;
    fees_saved?: number;
  }>;
}) {
  return ask({
    schema: LedgerSchema,
    effort: "medium",
    system: `You summarize a solo business's invoice history.

Use only the data provided — never estimate beyond it. The narrative is three or
four plain-language sentences: encouraging but honest. If the month was bad, say
so kindly rather than spinning it.

fees_saved_estimate is the sum of the fees_saved values present in the data; if
none are present, return 0.`,
    user: JSON.stringify(history),
  });
}
