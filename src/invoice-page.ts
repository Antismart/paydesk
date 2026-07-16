/**
 * Client-facing invoice page.
 *
 * This is the only surface a human ever sees — the freelancer's client opens
 * this link to find out what they owe and how to pay it. It is therefore also
 * the only place where user-supplied invoice fields meet an HTML parser, so
 * every interpolation in this file goes through `esc()`. No exceptions: the
 * templates below never embed a raw value.
 *
 * Mount in server.ts:  app.use(invoicePage)
 */

import { Router } from "express";
import * as store from "./store.js";
import type { Invoice } from "./store.js";

export const router: Router = Router();

/**
 * The single escaping primitive. Escapes the five characters that can break
 * out of either an element body or a quoted attribute value. Every dynamic
 * value below is wrapped in this, including ones that "look safe" like
 * numbers — the type is the only thing keeping them numeric, and types are
 * erased at runtime.
 */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** `currency` is a free-form user string; Intl throws on anything non-ISO. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Dates are stored as YYYY-MM-DD strings; parse in UTC to avoid TZ drift. */
function longDate(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysOverdue(dueDate: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due)) return 0;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.floor((today - due) / 86_400_000);
}

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    padding: 24px 16px 64px;
    background: #efe9dd;
    background-image:
      radial-gradient(circle at 15% 0%, #f7f2e8 0%, transparent 55%),
      radial-gradient(circle at 100% 100%, #e6dfd0 0%, transparent 50%);
    background-attachment: fixed;
    color: #1c1a17;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Palladio,
      "URW Palladio L", "Book Antiqua", Baskerville, "Times New Roman", serif;
    font-size: 17px;
    line-height: 1.5;
    font-kerning: normal;
    text-rendering: optimizeLegibility;
  }
  .sheet {
    max-width: 46rem;
    margin: 0 auto;
    background: #fdfbf6;
    border: 1px solid #d9d0bd;
    border-top: 4px solid #6b1d1d;
    box-shadow: 0 1px 2px rgba(40, 30, 15, .06), 0 18px 44px -20px rgba(40, 30, 15, .3);
    padding: 36px 24px 32px;
  }
  .eyebrow {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: #8a7f6a;
  }
  .masthead {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid #e2d9c6;
    padding-bottom: 20px;
  }
  .wordmark { font-size: 21px; font-weight: 600; letter-spacing: .01em; }
  .wordmark span { color: #6b1d1d; }
  h1 {
    margin: 22px 0 0;
    font-size: clamp(30px, 9vw, 44px);
    font-weight: 400;
    font-style: italic;
    letter-spacing: -.015em;
    line-height: 1.05;
  }
  .number {
    margin-top: 6px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 14px;
    letter-spacing: .06em;
    color: #6b1d1d;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    padding: 5px 12px 5px 10px;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .status::before {
    content: "";
    width: 7px; height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .status--paid { color: #2f5d3a; background: #eef4ee; }
  .status--overdue { color: #8c2b12; background: #fbeee9; }
  .status--due { color: #6a6152; background: #f4f0e6; }

  .meta {
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
    margin: 28px 0 0;
    padding: 20px 0;
    border-top: 1px solid #e2d9c6;
    border-bottom: 1px solid #e2d9c6;
  }
  .meta div :last-child { margin-top: 3px; font-size: 16px; }
  .meta strong { font-weight: 600; }

  /*
   * Line items. A real <table> cannot shrink below its min-content width, so on
   * a narrow phone the tabular layout spills past the sheet and clips the amount
   * column. Below 40rem each item therefore becomes a stacked block:
   *
   *   API integration
   *   1 × USD 600.00                              USD 1,200.00
   *
   * The stacked form is deliberately self-describing ("1 × rate", amount ranged
   * right) rather than a grid of label/value pairs: overriding the display of
   * table elements drops their table semantics in most engines, so the row must
   * still read correctly once the column headers are gone. Tabular layout is
   * restored at >=40rem, where it fits.
   */
  table { width: 100%; border-collapse: collapse; margin-top: 28px; }
  caption {
    text-align: left;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: #8a7f6a;
    padding-bottom: 10px;
  }
  th {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #6a6152;
    text-align: left;
    padding: 0 0 8px;
    border-bottom: 1px solid #1c1a17;
  }
  td { vertical-align: top; }
  tfoot .label {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: #8a7f6a;
  }
  tfoot .total {
    font-size: clamp(22px, 6vw, 28px);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }

  /* --- Narrow: stacked rows --- */
  thead {
    position: absolute;
    width: 1px; height: 1px;
    margin: -1px; padding: 0; border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  tbody, tfoot { display: block; }
  tbody tr, tfoot tr {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 6px;
  }
  tbody tr { padding: 14px 0; border-bottom: 1px solid #ece5d6; }
  tbody td, tfoot td { display: block; padding: 0; border: none; }
  .desc {
    flex: 1 0 100%;
    margin-bottom: 5px;
    overflow-wrap: anywhere;
  }
  .qty, .rate {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    color: #6a6152;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .qty::after { content: " \\00d7"; }
  .amount {
    margin-left: auto;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .spacer { display: none; }
  tfoot tr {
    justify-content: space-between;
    margin-top: 2px;
    padding-top: 16px;
    border-top: 2px solid #1c1a17;
  }

  .pay { margin-top: 34px; }
  .pay-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 12px; }
  .rail {
    border: 1px solid #ded5c2;
    background: #f8f4ea;
    padding: 16px;
  }
  .rail h3 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #6b1d1d;
  }
  .rail p {
    margin: 0;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.65;
    word-break: break-word;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    color: #33302a;
  }
  .rail .tag {
    display: inline-block;
    margin-top: 10px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #2f5d3a;
  }
  .notes {
    margin-top: 30px;
    padding: 16px 18px;
    border-left: 2px solid #c9b98f;
    background: #f8f4ea;
    font-style: italic;
    color: #46413a;
  }
  .notes p { margin: 0; white-space: pre-wrap; }
  footer {
    margin-top: 34px;
    padding-top: 18px;
    border-top: 1px solid #e2d9c6;
    font-size: 13px;
    color: #7d735f;
  }
  footer p { margin: 0 0 6px; white-space: pre-wrap; }
  footer .colophon { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #a2977f; }

  @media (min-width: 40rem) {
    body { padding: 56px 24px 80px; }
    .sheet { padding: 52px 56px 44px; }
    .meta { grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .pay-grid { grid-template-columns: 1fr 1fr; gap: 18px; }
    .rail { padding: 20px; }

    /* --- Wide: restore true tabular layout --- */
    thead {
      position: static;
      width: auto; height: auto;
      margin: 0;
      overflow: visible;
      clip-path: none;
      display: table-header-group;
    }
    tbody { display: table-row-group; }
    tfoot { display: table-footer-group; }
    tbody tr, tfoot tr {
      display: table-row;
      padding: 0;
      border-bottom: none;
      border-top: none;
      margin-top: 0;
    }
    tbody td, tfoot td { display: table-cell; }
    tbody td { padding: 13px 0; border-bottom: 1px solid #ece5d6; }
    tfoot td { padding: 18px 0 0; border-bottom: none; }
    .desc { padding: 13px 8px 13px 0; margin-bottom: 0; }
    .num { text-align: right; white-space: nowrap; padding-left: 12px; }
    .qty, .rate {
      font-family: inherit;
      font-size: inherit;
      color: inherit;
    }
    .qty::after { content: none; }
    .amount { margin-left: 0; }
    .spacer { display: table-cell; }
    tfoot .total { border-top: 2px solid #1c1a17; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: none; box-shadow: none; max-width: none; }
  }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function statusBadge(invoice: Invoice): string {
  if (invoice.paid) {
    return `<p class="status status--paid">Paid in full</p>`;
  }
  const over = daysOverdue(invoice.due_date);
  if (over > 0) {
    const label = over === 1 ? "1 day overdue" : `${over} days overdue`;
    return `<p class="status status--overdue">${esc(label)}</p>`;
  }
  return `<p class="status status--due">Due ${esc(longDate(invoice.due_date))}</p>`;
}

function renderInvoice(invoice: Invoice): string {
  const rows = invoice.line_items
    .map(
      (item) => `<tr>
          <td class="desc">${esc(item.description)}</td>
          <td class="num qty">${esc(item.qty)}</td>
          <td class="num rate">${esc(money(item.unit_price, invoice.currency))}</td>
          <td class="num amount">${esc(money(item.qty * item.unit_price, invoice.currency))}</td>
        </tr>`,
    )
    .join("\n");

  const railTag =
    invoice.recommended_rail && !invoice.paid
      ? `<p class="tag">Recommended &middot; ${esc(invoice.recommended_rail)}</p>`
      : "";

  const notes = invoice.notes
    ? `<aside class="notes"><p>${esc(invoice.notes)}</p></aside>`
    : "";

  const body = `<main class="sheet">
  <header class="masthead">
    <p class="wordmark">Pay<span>Desk</span></p>
    <p class="eyebrow">Statement of account</p>
  </header>

  <h1>Invoice</h1>
  <p class="number">${esc(invoice.invoice_number)}</p>
  ${statusBadge(invoice)}

  <section class="meta">
    <div>
      <p class="eyebrow">Billed to</p>
      <p><strong>${esc(invoice.client_name)}</strong></p>
    </div>
    <div>
      <p class="eyebrow">Issued</p>
      <p>${esc(longDate(invoice.issue_date))}</p>
    </div>
    <div>
      <p class="eyebrow">Due</p>
      <p>${esc(longDate(invoice.due_date))}</p>
    </div>
  </section>

  <table>
    <caption>Services rendered</caption>
    <thead>
      <tr>
        <th scope="col">Description</th>
        <th scope="col" class="num">Qty</th>
        <th scope="col" class="num">Rate</th>
        <th scope="col" class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
    <tfoot>
      <tr>
        <td class="spacer" colspan="2"></td>
        <td class="num label">Total due</td>
        <td class="num total">${esc(money(invoice.amount, invoice.currency))}</td>
      </tr>
    </tfoot>
  </table>

  <section class="pay">
    <p class="eyebrow">How to pay</p>
    <div class="pay-grid">
      <div class="rail">
        <h3>Stablecoin</h3>
        <p>${esc(invoice.payment_instructions.stablecoin)}</p>
        ${railTag}
      </div>
      <div class="rail">
        <h3>Bank transfer</h3>
        <p>${esc(invoice.payment_instructions.bank)}</p>
      </div>
    </div>
  </section>

  ${notes}

  <footer>
    <p>${esc(invoice.footer_note)}</p>
    <p class="colophon">Prepared with PayDesk &middot; PayDesk never holds or moves your funds</p>
  </footer>
</main>`;

  return page(`Invoice ${invoice.invoice_number} — ${invoice.client_name}`, body);
}

function renderNotFound(): string {
  return page(
    "Invoice not found",
    `<main class="sheet">
  <header class="masthead">
    <p class="wordmark">Pay<span>Desk</span></p>
  </header>
  <h1>Not found</h1>
  <p class="number">404</p>
  <p style="margin-top:22px;max-width:34rem;">
    This invoice link isn&rsquo;t valid. It may have been mistyped, or the invoice
    may never have existed. Please check the link with whoever sent it to you.
  </p>
  <footer>
    <p class="colophon">Prepared with PayDesk</p>
  </footer>
</main>`,
  );
}

router.get("/i/:id", async (req, res) => {
  const invoice = await store.get(req.params.id);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "no-store");
  // Nothing on this page loads or executes anything; say so explicitly.
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  if (!invoice) {
    res.status(404).send(renderNotFound());
    return;
  }
  res.send(renderInvoice(invoice));
});

export default router;
