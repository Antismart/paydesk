/**
 * The freelancer's desk: the operator-facing web surface.
 *
 * Where /i/:id is the sheet you hand a client, this is the desk you work at.
 * Same house style — warm paper, oxblood rule, old-style serif, monospace for
 * anything a machine produced — deliberately, so the two read as one product.
 * The desk is allowed a little more ink and motion than the sheet, because the
 * sheet is a document and this is an instrument.
 *
 * Self-contained by construction: inline CSS, inline vanilla JS, no webfonts, no
 * CDN, no build step. Everything the page needs arrives in this one response.
 *
 * XSS: this file ships a static shell — no request data, no store data, and no
 * model output is ever interpolated into the HTML string below. Dynamic values
 * arrive later as JSON and reach the DOM only through textContent (see the `el`
 * helper and `setText`). There is no innerHTML assignment on this page.
 *
 * Mount in server.ts:  app.use(webUi)   — after /health and /i/:id.
 */

import { Router } from "express";
import { FREE_INVOICES } from "./config.js";
import { PRICES } from "./x402.js";

export const router: Router = Router();

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }

  :root {
    --ink: #1c1a17;
    --ink-soft: #46413a;
    --muted: #6a6152;
    --faint: #8a7f6a;
    --ghost: #a2977f;
    --paper: #efe9dd;
    --sheet: #fdfbf6;
    --sheet-2: #f8f4ea;
    --rule: #e2d9c6;
    --rule-hard: #d9d0bd;
    --oxblood: #6b1d1d;
    --oxblood-lift: #8a2a2a;
    --green: #2f5d3a;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Palladio,
      "URW Palladio L", "Book Antiqua", Baskerville, "Times New Roman", serif;
  }

  body {
    margin: 0;
    padding: 20px 14px 72px;
    background: var(--paper);
    background-image:
      radial-gradient(circle at 15% 0%, #f7f2e8 0%, transparent 55%),
      radial-gradient(circle at 100% 100%, #e6dfd0 0%, transparent 50%);
    background-attachment: fixed;
    color: var(--ink);
    font-family: var(--serif);
    font-size: 17px;
    line-height: 1.5;
    font-kerning: normal;
    text-rendering: optimizeLegibility;
  }

  .wrap { max-width: 46rem; margin: 0 auto; }

  .eyebrow {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--faint);
  }

  /* --- Masthead ------------------------------------------------------- */
  .masthead {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 14px;
    border-bottom: 2px solid var(--ink);
  }
  .wordmark { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: .01em; }
  .wordmark span { color: var(--oxblood); }

  .lede { margin: 26px 0 0; }
  .lede h1 {
    margin: 0;
    font-size: clamp(32px, 9.5vw, 52px);
    font-weight: 400;
    font-style: italic;
    letter-spacing: -.02em;
    line-height: 1.02;
  }
  .lede h1 em { font-style: normal; color: var(--oxblood); }
  .lede p {
    margin: 14px 0 0;
    max-width: 34rem;
    color: var(--ink-soft);
  }

  /* --- Sheets --------------------------------------------------------- */
  .sheet {
    margin-top: 26px;
    background: var(--sheet);
    border: 1px solid var(--rule-hard);
    border-top: 3px solid var(--oxblood);
    box-shadow: 0 1px 2px rgba(40,30,15,.06), 0 18px 44px -22px rgba(40,30,15,.3);
    padding: 22px 18px;
  }

  /* --- Intake --------------------------------------------------------- */
  .field { margin-top: 12px; }
  textarea {
    display: block;
    width: 100%;
    min-height: 6.5rem;
    padding: 14px 14px;
    background: var(--sheet-2);
    border: 1px solid var(--rule-hard);
    border-radius: 0;
    color: var(--ink);
    font-family: var(--serif);
    font-size: 17px;
    line-height: 1.55;
    resize: vertical;
  }
  textarea::placeholder { color: var(--ghost); font-style: italic; }
  textarea:focus-visible {
    outline: 2px solid var(--oxblood);
    outline-offset: 1px;
    background: #fff;
  }

  .corridor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--faint);
  }
  select {
    font-family: var(--mono);
    font-size: 12px;
    padding: 5px 6px;
    background: var(--sheet-2);
    border: 1px solid var(--rule-hard);
    color: var(--ink);
    border-radius: 0;
  }
  select:focus-visible { outline: 2px solid var(--oxblood); outline-offset: 1px; }
  .corridor .arrow { color: var(--oxblood); font-family: var(--serif); font-size: 15px; }

  /* --- Buttons -------------------------------------------------------- */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin-top: 16px;
    padding: 12px 20px;
    border: 1px solid var(--oxblood);
    background: var(--oxblood);
    color: #fdfbf6;
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: .14em;
    text-transform: uppercase;
    border-radius: 0;
    cursor: pointer;
    transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
  }
  .btn:hover:not(:disabled) {
    background: var(--oxblood-lift);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px -8px rgba(107,29,29,.8);
  }
  .btn:active:not(:disabled) { transform: translateY(0); }
  .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .btn:disabled { opacity: .55; cursor: progress; }
  .btn--ghost {
    background: transparent;
    color: var(--oxblood);
    border-color: var(--rule-hard);
  }
  .btn--ghost:hover:not(:disabled) { background: var(--sheet-2); color: var(--oxblood); box-shadow: none; }
  .btn-row { display: flex; flex-wrap: wrap; gap: 10px; }
  .btn-row .btn { margin-top: 16px; }

  /* --- Working state -------------------------------------------------- */
  /* A ledger being written in: ruled lines, a sweeping rule, a live caret. */
  .working { margin-top: 18px; }
  .working .rules { display: grid; gap: 9px; }
  .working .rules i {
    display: block;
    height: 9px;
    background: linear-gradient(90deg, var(--rule) 0%, #eee6d5 50%, var(--rule) 100%);
    background-size: 220% 100%;
    animation: sweep 1.5s ease-in-out infinite;
  }
  .working .rules i:nth-child(2) { width: 78%; animation-delay: .12s; }
  .working .rules i:nth-child(3) { width: 55%; animation-delay: .24s; }
  @keyframes sweep {
    0% { background-position: 130% 0; }
    100% { background-position: -30% 0; }
  }
  .working .status {
    margin: 14px 0 0;
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: .04em;
    color: var(--muted);
  }
  .working .status::after {
    content: "";
    display: inline-block;
    width: 7px; height: 13px;
    margin-left: 5px;
    background: var(--oxblood);
    vertical-align: -2px;
    animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

  /* --- Draft ---------------------------------------------------------- */
  .draft-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 16px 0 0;
    padding: 18px 0;
    border-top: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
  }
  .draft-grid .val { margin: 3px 0 0; font-size: 17px; }
  .draft-grid .val--lg {
    font-size: clamp(24px, 7vw, 30px);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .draft-grid .val--none { color: var(--ghost); font-style: italic; }

  .items { margin: 16px 0 0; padding: 0; list-style: none; }
  .items li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    padding: 9px 0;
    border-bottom: 1px solid #ece5d6;
  }
  .items .d { flex: 1 1 60%; overflow-wrap: anywhere; }
  .items .n {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* --- Clarifying question -------------------------------------------- */
  /* The product asks instead of guessing; the question is set as the voice of
     the desk, not as an error. */
  .ask {
    margin-top: 16px;
    padding: 18px 18px 18px 20px;
    border-left: 3px solid var(--oxblood);
    background: var(--sheet-2);
  }
  .ask p {
    margin: 8px 0 0;
    font-size: clamp(19px, 5vw, 23px);
    font-style: italic;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .ask .missing {
    margin: 12px 0 0;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--faint);
  }

  /* --- Error ---------------------------------------------------------- */
  .err {
    margin-top: 16px;
    padding: 16px 18px;
    border-left: 3px solid #8c2b12;
    background: #fbeee9;
  }
  .err p { margin: 8px 0 0; font-family: var(--mono); font-size: 13px; line-height: 1.6; color: #6b2410; overflow-wrap: anywhere; }
  .err .eyebrow { color: #8c2b12; }

  /* --- Result: the link ------------------------------------------------ */
  .link-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding: 14px 16px;
    background: var(--sheet-2);
    border: 1px solid var(--rule-hard);
  }
  .link-row a {
    flex: 1 1 auto;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--oxblood);
    overflow-wrap: anywhere;
  }
  .link-row a:hover { text-decoration-thickness: 2px; }
  .copy {
    flex: 0 0 auto;
    padding: 7px 11px;
    background: transparent;
    border: 1px solid var(--rule-hard);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--muted);
    cursor: pointer;
  }
  .copy:hover { border-color: var(--oxblood); color: var(--oxblood); }
  .copy:focus-visible { outline: 2px solid var(--oxblood); outline-offset: 1px; }

  /* --- THE MONEY SHOT: routes card ------------------------------------ */
  .routes {
    margin-top: 22px;
    padding: 24px 18px 20px;
    background: #17130f;
    background-image:
      radial-gradient(circle at 12% 0%, rgba(107,29,29,.55) 0%, transparent 58%),
      radial-gradient(circle at 100% 105%, rgba(107,29,29,.3) 0%, transparent 55%);
    border: 1px solid #2c241c;
    box-shadow: 0 22px 60px -26px rgba(23,19,15,.9);
    color: #f3ece0;
    position: relative;
    overflow: hidden;
  }
  /* Grain: keeps the dark field from reading as flat digital black. */
  .routes::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .05;
    background-image:
      repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px),
      repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 3px);
  }
  .routes > * { position: relative; z-index: 1; }
  .routes .eyebrow { color: #b9a88c; }

  .savings { margin: 14px 0 0; }
  .savings .fig {
    margin: 0;
    font-size: clamp(52px, 17vw, 92px);
    font-style: italic;
    font-weight: 400;
    line-height: .92;
    letter-spacing: -.035em;
    color: #fff;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
    text-shadow: 0 2px 30px rgba(233,180,140,.25);
  }
  .savings .cap {
    margin: 10px 0 0;
    max-width: 26rem;
    font-size: 15px;
    font-style: italic;
    color: #cdbfa8;
  }
  .savings .cap b { font-style: normal; font-weight: 600; color: #f3ece0; }

  .rail-list {
    margin: 22px 0 0;
    padding: 18px 0 0;
    list-style: none;
    border-top: 1px solid rgba(233,222,203,.16);
  }
  .rail-list li {
    padding: 13px 0;
    border-bottom: 1px solid rgba(233,222,203,.09);
  }
  .rail-list li:last-child { border-bottom: none; }

  .rail-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
  }
  .rail-name { flex: 1 1 auto; font-size: 16px; color: #f3ece0; overflow-wrap: anywhere; }
  .rail-fee {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 14px;
    color: #f3ece0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rail--best .rail-name { font-weight: 600; }
  .rail--best .rail-fee { color: #f7d8a8; }

  .badge {
    display: inline-block;
    padding: 3px 8px;
    background: var(--oxblood);
    color: #fff;
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: .16em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The bar is the argument: the recommended rail's fee is a hairline next to
     the alternatives, and the eye gets there before the numbers do. */
  .bar {
    height: 5px;
    margin: 10px 0 8px;
    background: rgba(233,222,203,.09);
  }
  .bar i {
    display: block;
    height: 100%;
    background: #6f6252;
    transform-origin: left center;
    animation: grow .85s cubic-bezier(.22,.9,.28,1) both;
  }
  .rail--best .bar i {
    background: linear-gradient(90deg, #f7d8a8, #d99a5e);
    box-shadow: 0 0 14px rgba(247,216,168,.55);
  }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .rail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .04em;
    color: #a3937c;
  }
  .rail-meta .net { color: #cdbfa8; }

  .rationale {
    margin: 20px 0 0;
    padding: 16px 0 0;
    border-top: 1px solid rgba(233,222,203,.16);
    font-size: 16px;
    font-style: italic;
    line-height: 1.5;
    color: #ded2bd;
    overflow-wrap: anywhere;
  }
  .disclosure {
    margin: 14px 0 0;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1.6;
    letter-spacing: .04em;
    color: #7d715f;
    overflow-wrap: anywhere;
  }
  .warn {
    margin: 12px 0 0;
    padding: 9px 11px;
    border-left: 2px solid #c98a3c;
    background: rgba(201,138,60,.1);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.6;
    color: #e0c193;
    overflow-wrap: anywhere;
  }

  /* --- Pricing -------------------------------------------------------- */
  .pricing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 26px;
    padding: 16px 18px;
    background: var(--sheet);
    border: 1px solid var(--rule-hard);
    border-left: 3px solid var(--ink);
  }
  .pricing .terms { flex: 1 1 16rem; margin: 0; font-size: 15px; }
  .pricing .terms b { font-weight: 600; }
  .pricing .left {
    margin: 4px 0 0;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pricing .left .n { color: var(--oxblood); font-weight: 600; }
  .pricing .btn { margin-top: 0; }
  .pricing--pro { border-left-color: var(--green); }
  .plan {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 11px;
    border: 1px solid var(--green);
    background: #eef4ee;
    color: var(--green);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .plan::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  /* --- Recent ledger strip -------------------------------------------- */
  .recent { margin-top: 26px; }
  .recent ol { margin: 10px 0 0; padding: 0; list-style: none; }
  .recent li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--rule);
  }
  .recent .no {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: .06em;
    color: var(--oxblood);
  }
  .recent .who {
    flex: 1 1 auto;
    overflow-wrap: anywhere;
    color: var(--ink);
    text-decoration-color: var(--rule-hard);
    text-underline-offset: 2px;
  }
  .recent .who:hover { color: var(--oxblood); text-decoration-color: currentColor; }
  .recent .who:focus-visible { outline: 2px solid var(--oxblood); outline-offset: 2px; }
  .recent .amt {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* --- Stub marker ----------------------------------------------------- */
  /* Loud on purpose. A stubbed screen must never be mistakable for a real one. */
  .stub-flag {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 16px;
    padding: 9px 12px;
    border: 1px dashed #8c2b12;
    background: repeating-linear-gradient(
      45deg, rgba(140,43,18,.07) 0 8px, transparent 8px 16px);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #8c2b12;
  }

  footer.colophon {
    margin-top: 34px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ghost);
  }

  [hidden] { display: none !important; }

  /* Staggered entrance for each panel as it lands. */
  .enter { animation: rise .5s cubic-bezier(.22,.9,.28,1) both; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }

  @media (min-width: 40rem) {
    body { padding: 44px 24px 88px; }
    .sheet { padding: 32px 34px 28px; }
    .routes { padding: 34px 34px 28px; }
    .draft-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
    .rail-head { gap: 12px; }
  }
`;

const SCRIPT = String.raw`
(function () {
  "use strict";

  // --- DOM helpers. Text always goes in via textContent; nothing on this page
  // --- assigns innerHTML, so model and user strings cannot become markup.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function show(node) { node.hidden = false; }
  function hide(node) { node.hidden = true; }

  var $ = function (id) { return document.getElementById(id); };

  var form = $("intake-form");
  var input = $("request");
  var payer = $("payer");
  var payee = $("payee");
  var submitBtn = $("submit");
  var panels = $("panels");

  var state = { draft: null };

  // --- Formatting ------------------------------------------------------
  function money(amount, currency) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: currency, currencyDisplay: "code"
      }).format(amount);
    } catch (e) {
      return String(currency) + " " + Number(amount).toFixed(2);
    }
  }
  function longDate(iso) {
    var t = Date.parse(iso + "T00:00:00Z");
    if (isNaN(t)) return iso;
    return new Date(t).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    });
  }
  function addDays(days) {
    var d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // --- Working state ---------------------------------------------------
  // The agent calls take seconds. Silence reads as broken, and a spinner reads
  // as generic, so the desk shows the ledger being written and names the step
  // actually running.
  function working(steps) {
    var box = el("section", "sheet working enter");
    box.setAttribute("aria-busy", "true");
    box.appendChild(el("p", "eyebrow", "Working"));
    var rules = el("div", "rules");
    rules.appendChild(el("i")); rules.appendChild(el("i")); rules.appendChild(el("i"));
    box.appendChild(rules);
    var status = el("p", "status", steps[0]);
    status.setAttribute("role", "status");
    box.appendChild(status);

    var i = 0;
    var timer = setInterval(function () {
      i += 1;
      if (i >= steps.length) { clearInterval(timer); return; }
      status.textContent = steps[i];
    }, 1600);

    box.stop = function () { clearInterval(timer); };
    return box;
  }

  function stubFlag() {
    return el("div", "stub-flag",
      "Demo stub · canned agent output · no model was called");
  }

  function errorPanel(title, message) {
    var box = el("section", "sheet enter");
    var e = el("div", "err");
    e.appendChild(el("p", "eyebrow", title));
    e.appendChild(el("p", null, message));
    box.appendChild(e);
    return box;
  }

  // --- Fetch -----------------------------------------------------------
  function post(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () {
        throw new Error("Server returned an unreadable response (HTTP " + res.status + ").");
      }).then(function (data) {
        if (!res.ok) throw new Error(data && data.message ? data.message : "Request failed (HTTP " + res.status + ").");
        return data;
      });
    });
  }

  // --- Step 1: intake --------------------------------------------------
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var request = input.value.trim();
    if (!request) { input.focus(); return; }

    clear(panels);
    submitBtn.disabled = true;
    var w = working([
      "Reading the request…",
      "Pulling out client, amount and terms…",
      "Checking what’s missing…"
    ]);
    panels.appendChild(w);

    post("/api/intake", { request: request }).then(function (data) {
      w.stop(); clear(panels);
      state.draft = data.draft;
      renderDraft(data.draft, data.stub);
    }).catch(function (err) {
      w.stop(); clear(panels);
      panels.appendChild(errorPanel("Could not read that request", err.message));
    }).then(function () {
      submitBtn.disabled = false;
    });
  });

  // --- Draft / clarifying question -------------------------------------
  function renderDraft(draft, stub) {
    if (draft.out_of_scope) {
      panels.appendChild(errorPanel(
        "Not an invoicing request",
        "PayDesk only creates invoices and compares payout routes. Try something like: invoice Acme Corp $1,200 for the API integration, net 14."
      ));
      return;
    }

    var box = el("section", "sheet enter");
    box.appendChild(el("p", "eyebrow", "Draft · nothing created yet"));

    // The product asks one question rather than guessing. This branch is the
    // whole P0-1 promise, so it gets the page's voice, not an error style.
    var needsInput = draft.clarifying_question || draft.amount === null || !draft.client_name;

    if (needsInput) {
      var ask = el("div", "ask");
      ask.appendChild(el("p", "eyebrow", "One question first"));
      ask.appendChild(el("p", null,
        draft.clarifying_question ||
        "What amount should this invoice be for, and who is it going to?"));
      if (draft.missing_fields && draft.missing_fields.length) {
        ask.appendChild(el("p", "missing", "Missing · " + draft.missing_fields.join(" · ")));
      }
      box.appendChild(ask);
      if (stub) box.appendChild(stubFlag());

      var again = el("button", "btn btn--ghost", "Refine the request");
      again.type = "button";
      again.addEventListener("click", function () {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      box.appendChild(again);
      panels.appendChild(box);
      return;
    }

    var grid = el("div", "draft-grid");
    function cell(label, value, cls) {
      var d = document.createElement("div");
      d.appendChild(el("p", "eyebrow", label));
      d.appendChild(el("p", "val" + (cls ? " " + cls : ""), value));
      return d;
    }
    grid.appendChild(cell("Client", draft.client_name));
    grid.appendChild(cell("Amount", money(draft.amount, draft.currency), "val--lg"));
    grid.appendChild(cell("Currency", draft.currency));
    grid.appendChild(cell("Due", longDate(addDays(draft.due_days))));
    box.appendChild(grid);

    if (draft.line_items && draft.line_items.length) {
      box.appendChild(el("p", "eyebrow", "Line items"));
      var ul = el("ul", "items");
      draft.line_items.forEach(function (item) {
        var li = document.createElement("li");
        li.appendChild(el("span", "d", item.description));
        li.appendChild(el("span", "n", item.qty + " × " + money(item.unit_price, draft.currency)));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    if (draft.notes) {
      var n = el("p", "val");
      n.style.marginTop = "14px";
      n.style.fontStyle = "italic";
      n.textContent = draft.notes;
      box.appendChild(n);
    }

    if (stub) box.appendChild(stubFlag());

    var row = el("div", "btn-row");
    var confirm = el("button", "btn", "Confirm · create invoice");
    confirm.type = "button";
    confirm.addEventListener("click", function () { create(draft, confirm); });
    row.appendChild(confirm);

    var edit = el("button", "btn btn--ghost", "Edit request");
    edit.type = "button";
    edit.addEventListener("click", function () {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    row.appendChild(edit);
    box.appendChild(row);

    panels.appendChild(box);
  }

  // --- Step 2: create --------------------------------------------------
  function create(draft, btn) {
    btn.disabled = true;
    clear(panels);
    var w = working([
      "Allocating an invoice number…",
      "Comparing payout rails on this corridor…",
      "Writing the client’s payment instructions…",
      "Putting the sheet together…"
    ]);
    panels.appendChild(w);

    post("/api/create", {
      draft: draft,
      payer_country: payer.value,
      payee_country: payee.value
    }).then(function (data) {
      w.stop(); clear(panels);
      renderResult(data);
      refreshBilling(data.billing);
      loadRecent();
    }).catch(function (err) {
      w.stop(); clear(panels);
      panels.appendChild(errorPanel("Could not create the invoice", err.message));
      renderDraft(draft, false);
    });
  }

  function renderResult(data) {
    var box = el("section", "sheet enter");
    box.appendChild(el("p", "eyebrow", "Invoice " + data.invoice.invoice_number + " · created"));

    var h = el("p", null, data.invoice.client_name + " — " +
      money(data.invoice.amount, data.invoice.currency) +
      ", due " + longDate(data.invoice.due_date));
    h.style.margin = "10px 0 14px";
    h.style.fontSize = "19px";
    box.appendChild(h);

    box.appendChild(el("p", "eyebrow", "Share this link with your client"));
    var row = el("div", "link-row");
    var a = el("a", null, data.invoice_url);
    a.href = data.invoice_url;
    a.target = "_blank";
    a.rel = "noopener";
    row.appendChild(a);

    var copy = el("button", "copy", "Copy");
    copy.type = "button";
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy"; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.invoice_url).then(done, function () {
          copy.textContent = "Press ⌘C";
        });
      } else {
        copy.textContent = "Press ⌘C";
      }
    });
    row.appendChild(copy);
    box.appendChild(row);

    if (data.stub) box.appendChild(stubFlag());

    box.appendChild(routesCard(data.routes));
    panels.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // --- THE MONEY SHOT ---------------------------------------------------
  function routesCard(routes) {
    var card = el("section", "routes");

    var corridorLabel = routes.corridor.replace("-", " → ");
    card.appendChild(el("p", "eyebrow", "Payout routing · " + corridorLabel));

    var best = null;
    for (var i = 0; i < routes.routes.length; i++) {
      if (routes.routes[i].rail_id === routes.recommended) { best = routes.routes[i]; break; }
    }

    var sav = el("div", "savings");
    sav.appendChild(el("p", "fig", money(routes.savings_vs_worst, routes.currency)));
    var cap = el("p", "cap");
    cap.appendChild(document.createTextNode("kept, versus the most expensive route on this corridor. "));
    if (best) {
      var b = el("b", null, best.rail);
      cap.appendChild(b);
      cap.appendChild(document.createTextNode(
        " lands " + best.est_arrival + " for " + money(best.est_fee_abs, routes.currency) + "."));
    }
    sav.appendChild(cap);
    card.appendChild(sav);

    var maxFee = 0;
    routes.routes.forEach(function (r) { if (r.est_fee_abs > maxFee) maxFee = r.est_fee_abs; });

    var ul = el("ul", "rail-list");
    routes.routes.forEach(function (r, idx) {
      var li = document.createElement("li");
      var isBest = r.rail_id === routes.recommended;
      li.className = isBest ? "rail--best" : "";

      var head = el("div", "rail-head");
      head.appendChild(el("span", "rail-name", r.rail));
      if (isBest) head.appendChild(el("span", "badge", "Recommended"));
      head.appendChild(el("span", "rail-fee", money(r.est_fee_abs, routes.currency) + " fee"));
      li.appendChild(head);

      var bar = el("div", "bar");
      var fill = el("i");
      // Proportional to fee, so the recommended rail is a hairline and the
      // alternatives are long. The chart is the argument.
      var pct = maxFee > 0 ? (r.est_fee_abs / maxFee) * 100 : 0;
      fill.style.width = Math.max(pct, 1.2) + "%";
      fill.style.animationDelay = (0.1 + idx * 0.09) + "s";
      bar.appendChild(fill);
      li.appendChild(bar);

      var meta = el("div", "rail-meta");
      meta.appendChild(el("span", "net", "You keep " + money(r.est_net, routes.currency)));
      meta.appendChild(el("span", null, r.est_arrival));
      meta.appendChild(el("span", null, r.est_fee_pct.toFixed(2) + "%"));
      li.appendChild(meta);

      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (routes.rationale) card.appendChild(el("p", "rationale", routes.rationale));
    if (routes.data_warning) card.appendChild(el("p", "warn", routes.data_warning));
    if (routes.disclosure) card.appendChild(el("p", "disclosure", routes.disclosure));

    return card;
  }

  // --- Pricing ----------------------------------------------------------
  var leftEl = $("free-left");
  var pricingEl = $("pricing");
  var upgradeBtn = $("upgrade");
  var upgraded = false;

  function refreshBilling(billing) {
    if (!billing || upgraded) return;
    var n = billing.free_invoices_remaining;
    clear(leftEl);
    leftEl.appendChild(el("span", "n", String(n)));
    leftEl.appendChild(document.createTextNode(
      " of " + FREE_INVOICES + " free " + (n === 1 ? "invoice" : "invoices") + " remaining"));
  }

  upgradeBtn.addEventListener("click", function () {
    // Mocked: no charge is made and no plan exists yet. Billing runs over x402
    // on the agent path; the web checkout is not built.
    upgraded = true;
    pricingEl.classList.add("pricing--pro");
    upgradeBtn.replaceWith(el("span", "plan", "Pro · unlimited"));
    clear(leftEl);
    leftEl.appendChild(document.createTextNode("Unlimited invoices · billed monthly · "));
    var m = el("span", "n", "mock upgrade, no charge made");
    leftEl.appendChild(m);
  });

  // --- Recent ledger strip ----------------------------------------------
  var recentEl = $("recent");
  var recentList = $("recent-list");

  function loadRecent() {
    fetch("/api/invoices").then(function (r) { return r.json(); }).then(function (data) {
      if (data.billing) refreshBilling(data.billing);
      if (!data.invoices || !data.invoices.length) { hide(recentEl); return; }
      clear(recentList);
      data.invoices.slice(0, 5).forEach(function (inv) {
        var li = document.createElement("li");
        li.appendChild(el("span", "no", inv.invoice_number));
        var who = el("a", "who", inv.client_name);
        who.href = "/i/" + inv.id;
        li.appendChild(who);
        li.appendChild(el("span", "amt", money(inv.amount, inv.currency)));
        recentList.appendChild(li);
      });
      show(recentEl);
    }).catch(function () { /* the strip is a nicety; never block the page on it */ });
  }

  loadRecent();
})();
`;

/**
 * The shell. Static text only — every dynamic value on this page is fetched as
 * JSON and written with textContent by the script above. FREE_INVOICES and the
 * price are server constants, not user input, and are JSON-encoded rather than
 * pasted so the two surfaces cannot quote different terms.
 */
function page(): string {
  const constants = `const FREE_INVOICES = ${JSON.stringify(FREE_INVOICES)};
const PRICE_PER_INVOICE = ${JSON.stringify(PRICES.create_invoice)};`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<title>PayDesk — get paid globally, keep more of it</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <p class="wordmark">Pay<span>Desk</span></p>
    <p class="eyebrow">The desk</p>
  </header>

  <div class="lede">
    <h1>Get paid globally,<br><em>keep more of it.</em></h1>
    <p>
      Describe the invoice the way you&rsquo;d say it out loud. PayDesk drafts it,
      shows you the draft before anything exists, and works out which payout rail
      leaves the most money in your pocket.
    </p>
  </div>

  <section class="sheet">
    <form id="intake-form">
      <p class="eyebrow">What should we bill?</p>
      <div class="field">
        <label class="eyebrow" for="request" hidden>Invoicing request</label>
        <textarea id="request" name="request" autocomplete="off" spellcheck="false"
          placeholder="invoice Acme Corp $1,200 for the API integration, net 14"></textarea>
      </div>

      <div class="corridor">
        <label for="payer">Client pays from</label>
        <select id="payer" name="payer">
          <option value="US" selected>United States</option>
          <option value="EU">Eurozone</option>
          <option value="GB">United Kingdom</option>
        </select>
        <span class="arrow" aria-hidden="true">&rarr;</span>
        <label for="payee">You receive in</label>
        <select id="payee" name="payee">
          <option value="KE" selected>Kenya</option>
          <option value="NG">Nigeria</option>
          <option value="IN">India</option>
          <option value="PH">Philippines</option>
        </select>
      </div>

      <button class="btn" id="submit" type="submit">Draft the invoice</button>
    </form>
  </section>

  <div id="panels"></div>

  <section class="pricing" id="pricing">
    <div class="terms">
      <p class="terms" style="margin:0">
        <b>First ${FREE_INVOICES} invoices free</b>, then $${PRICES.create_invoice.toFixed(2)}/invoice.
      </p>
      <p class="left" id="free-left"><span class="n">${FREE_INVOICES}</span> of ${FREE_INVOICES} free invoices remaining</p>
    </div>
    <button class="btn btn--ghost" id="upgrade" type="button">Upgrade</button>
  </section>

  <section class="recent" id="recent" hidden>
    <p class="eyebrow">Recent invoices</p>
    <ol id="recent-list"></ol>
  </section>

  <footer class="colophon">
    PayDesk &middot; Route estimates, not quotes &middot; PayDesk never holds or moves your funds
  </footer>

</div>
<script>${constants}${SCRIPT}</script>
</body>
</html>`;
}

router.get("/", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "no-store");
  // The page talks to its own origin only, and loads nothing from anywhere else.
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  res.send(page());
});

export default router;
