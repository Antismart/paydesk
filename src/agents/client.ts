/**
 * Shared Anthropic client and schemas for the PayDesk agent team.
 *
 * Output shape is enforced by the API via structured outputs rather than by
 * asking the model to "return only JSON" — a malformed response is not a
 * failure mode we have to defend against.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Default model for the agents that write longer-form prose (collections,
// ledger). The invoice-path agents override this with FAST_MODEL: they run
// synchronously in front of a marketplace caller, so wall-clock is the
// constraint, not prose depth.
export const MODEL = "claude-sonnet-5";
export const FAST_MODEL = "claude-haiku-4-5";

export const client = new Anthropic();

type Effort = "low" | "medium" | "high";

/**
 * One call, one schema, one validated object back.
 *
 * Effort is per-agent: these run behind a paid per-call endpoint, so thinking
 * depth is a direct margin decision, not a default to inherit. `model` is per-
 * agent too — latency-sensitive agents on the request path pass FAST_MODEL.
 */
export async function ask<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  effort?: Effort;
  maxTokens?: number;
  model?: string;
}): Promise<z.infer<T>> {
  const res = await client.messages.parse({
    model: opts.model ?? MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    output_config: {
      // `effort` is only supported by the extended-thinking models (Sonnet/Opus).
      // Fast models (Haiku) reject it, so send it only when a caller asks for it.
      ...(opts.effort ? { effort: opts.effort } : {}),
      format: zodOutputFormat(opts.schema),
    },
    messages: [{ role: "user", content: opts.user }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("Model declined the request.");
  }
  if (res.parsed_output == null) {
    throw new Error(
      `Model returned no parseable output (stop_reason: ${res.stop_reason}).`,
    );
  }
  return res.parsed_output;
}

// --- Schemas (spec section 7, expressed as contracts rather than prose) ---

export const IntakeSchema = z.object({
  client_name: z.string().nullable(),
  client_email: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string(),
  line_items: z.array(
    z.object({
      description: z.string(),
      qty: z.number(),
      unit_price: z.number(),
    }),
  ),
  due_days: z.number().int(),
  notes: z.string().nullable(),
  missing_fields: z.array(z.string()),
  clarifying_question: z.string().nullable(),
  out_of_scope: z.boolean(),
});

export const InvoiceTextSchema = z.object({
  payment_instructions: z.object({
    stablecoin: z.string(),
    bank: z.string(),
  }),
  footer_note: z.string(),
});

export const RouteNarrativeSchema = z.object({
  rationale: z.string(),
});

export const CollectionsSchema = z.object({
  drafts: z.array(
    z.object({
      stage: z.enum(["gentle", "firm", "final"]),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});

export const LedgerSchema = z.object({
  period: z.string(),
  earned: z.number(),
  outstanding: z.number(),
  overdue_count: z.number().int(),
  fees_saved_estimate: z.number(),
  narrative: z.string(),
});
