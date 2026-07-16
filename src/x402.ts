/**
 * x402 payment layer for the PayDesk A2MCP endpoint.
 *
 * Wire format follows OKX Onchain OS Payments (x402 v2): the 402 carries a
 * base64 `PAYMENT-REQUIRED` header, the buyer replays with `PAYMENT-SIGNATURE`
 * (or legacy `X-PAYMENT`), and settlement is reported back in `PAYMENT-RESPONSE`.
 * Verification and settlement are delegated to the OKX facilitator — PayDesk
 * never holds, moves, or settles funds itself (spec section 3).
 */

import { createHmac } from "node:crypto";
import type { RequestHandler } from "express";

import * as store from "./store.js";

/** Per-call price in USD. 0 = free. */
export const PRICES = {
  // The discovery hook: free so any agent can find PayDesk without a wallet.
  compare_payout_routes: 0,
  create_invoice: 0.5,
  draft_payment_followups: 0.25,
  summarize_income: 0.25,
  mark_invoice_paid: 0,
} as const;

type ToolName = keyof typeof PRICES;

function required(name: string): string {
  const value = process.env[name];
  // Fail at import, not per-request: a missing key must never degrade to free.
  if (!value) throw new Error(`${name} is required to serve the paid /mcp endpoint`);
  return value;
}

const API_KEY = required("OKX_PAY_API_KEY");
const SECRET_KEY = required("OKX_PAY_SECRET_KEY");
const PASSPHRASE = required("OKX_PAY_PASSPHRASE");
const PAY_TO = required("PAYDESK_PAYOUT_ADDRESS");

// X Layer (eip155:196) is where OKX.AI settles.
const NETWORK = process.env.X402_NETWORK ?? "eip155:196";
// USD₮0 on X Layer. Override together with the two fields below when changing chain.
const ASSET = process.env.X402_ASSET ?? "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const ASSET_NAME = process.env.X402_ASSET_NAME ?? "USD₮0";
const ASSET_VERSION = process.env.X402_ASSET_VERSION ?? "1";
const ASSET_DECIMALS = Number(process.env.X402_ASSET_DECIMALS ?? 6);

const BASE_URL = process.env.OKX_PAY_BASE_URL ?? "https://web3.okx.com";
const VERIFY_PATH = "/api/v6/pay/x402/verify";
const SETTLE_PATH = "/api/v6/pay/x402/settle";

const X402_VERSION = 2;
const MAX_TIMEOUT_SECONDS = 60;

type PaymentRequirements = {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

/** Prices are USD; the asset is a USD stablecoin, so 1 USD = 1 token. */
function toAtomic(usd: number): string {
  return BigInt(Math.round(usd * 10 ** ASSET_DECIMALS)).toString();
}

function requirementsFor(price: number): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: toAtomic(price),
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    // sessionCert must never appear here — it belongs to the payload only.
    extra: { name: ASSET_NAME, version: ASSET_VERSION },
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown;
}

/** OKX REST auth: base64(HMAC-SHA256(timestamp + METHOD + path + body)). */
function sign(timestamp: string, path: string, body: string): string {
  return createHmac("sha256", SECRET_KEY).update(`${timestamp}POST${path}${body}`).digest("base64");
}

type Envelope<T> = { code: string; msg: string; data: T };

async function facilitator<T>(path: string, payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": API_KEY,
      "OK-ACCESS-SIGN": sign(timestamp, path, body),
      "OK-ACCESS-PASSPHRASE": PASSPHRASE,
      "OK-ACCESS-TIMESTAMP": timestamp,
    },
    body,
  });

  if (!res.ok) throw new Error(`facilitator ${path} returned HTTP ${res.status}`);

  const envelope = (await res.json()) as Envelope<T>;
  if (envelope.code !== "0") {
    throw new Error(`facilitator ${path} returned ${envelope.code}: ${envelope.msg}`);
  }
  return envelope.data;
}

type VerifyResult = {
  isValid: boolean;
  invalidReason: string | null;
  invalidMessage: string | null;
  payer: string | null;
};

type SettleResult = {
  success: boolean;
  errorReason: string | null;
  errorMessage: string | null;
  payer: string | null;
  transaction: string;
  network: string;
  status: string;
};

function resourceFor(req: { protocol: string; get(h: string): string | undefined }, tool: ToolName) {
  const host = req.get("host") ?? "localhost";
  return {
    url: `${process.env.PAYDESK_PUBLIC_URL ?? `${req.protocol}://${host}`}/mcp#${tool}`,
    description: `PayDesk ${tool}`,
    mimeType: "application/json",
  };
}

export function requirePayment(opts: { freeInvoices: number }): RequestHandler {
  return async (req, res, next) => {
    const body = req.body as { method?: string; params?: { name?: string } } | undefined;

    // Discovery (initialize, tools/list) is never gated — gating it would make
    // the service undiscoverable to the agents meant to find it.
    if (body?.method !== "tools/call") return next();

    const tool = body.params?.name as ToolName | undefined;
    if (!tool || !(tool in PRICES)) return next();

    const price = PRICES[tool];
    if (price === 0) return next();

    const caller = (req.header("x-paydesk-caller") ?? req.ip ?? "anonymous").toString();

    if (tool === "create_invoice" && (await store.usageCount(caller)) < opts.freeInvoices) {
      return next();
    }

    const requirements = requirementsFor(price);
    const resource = resourceFor(req, tool);

    const challenge = { x402Version: X402_VERSION, resource, accepts: [requirements] };
    const reject = (reason?: string, message?: string) => {
      res.setHeader("PAYMENT-REQUIRED", encode(challenge));
      res.status(402).json({ ...challenge, error: reason, message });
    };

    const header = req.header("PAYMENT-SIGNATURE") ?? req.header("X-PAYMENT");
    if (!header) return reject();

    let paymentPayload: unknown;
    try {
      paymentPayload = decode(header.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return reject("invalid_payment_header", "Payment header is not base64-encoded JSON.");
    }

    // paymentRequirements is always ours, never echoed from the payload —
    // otherwise a caller could name its own price.
    const request = { x402Version: X402_VERSION, paymentPayload, paymentRequirements: requirements };

    let verified: VerifyResult;
    try {
      verified = await facilitator<VerifyResult>(VERIFY_PATH, request);
    } catch (err) {
      return res.status(503).json({ error: "facilitator_unavailable", message: String(err) });
    }
    if (!verified.isValid) {
      return reject(verified.invalidReason ?? "payment_invalid", verified.invalidMessage ?? undefined);
    }

    let settled: SettleResult;
    try {
      settled = await facilitator<SettleResult>(SETTLE_PATH, request);
    } catch (err) {
      return res.status(503).json({ error: "facilitator_unavailable", message: String(err) });
    }
    if (!settled.success) {
      return reject(settled.errorReason ?? "settlement_failed", settled.errorMessage ?? undefined);
    }

    res.setHeader(
      "PAYMENT-RESPONSE",
      encode({
        x402Version: X402_VERSION,
        // `exact` settles synchronously; `transaction` may still be empty if the
        // facilitator batched it, so pass its status through rather than assert.
        status: settled.status || "success",
        transaction: settled.transaction,
        network: settled.network,
        payer: settled.payer,
        amount: requirements.amount,
      }),
    );

    next();
  };
}
