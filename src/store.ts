/**
 * JSON file store. Deliberately the simplest thing that survives a restart —
 * spec section 6 explicitly allows this for v1.
 *
 * PayDesk never holds funds (spec section 3). Nothing here records a balance;
 * `paid` is a flag a user sets by hand, not a settlement fact we observed.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  amount: number;
  currency: string;
  line_items: Array<{ description: string; qty: number; unit_price: number }>;
  issue_date: string;
  due_date: string;
  notes: string | null;
  paid: boolean;
  payment_instructions: { stablecoin: string; bank: string };
  footer_note: string;
  recommended_rail: string | null;
  fees_saved: number | null;
  created_by: string;
};

/**
 * Deployed hosts give you an ephemeral filesystem: anything written into the
 * image is lost on restart, taking every issued invoice link with it. Point
 * PAYDESK_DATA_DIR at a mounted volume in production.
 */
const DATA_DIR = process.env.PAYDESK_DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "invoices.json");

type Db = { invoices: Invoice[]; seq: number };

async function read(): Promise<Db> {
  try {
    return JSON.parse(await readFile(DB_PATH, "utf8")) as Db;
  } catch {
    return { invoices: [], seq: 0 };
  }
}

async function write(db: Db): Promise<void> {
  await mkdir(dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

export async function nextInvoiceNumber(): Promise<string> {
  const db = await read();
  db.seq += 1;
  await write(db);
  return `PD-${String(db.seq).padStart(4, "0")}`;
}

export async function save(invoice: Invoice): Promise<Invoice> {
  const db = await read();
  db.invoices.push(invoice);
  await write(db);
  return invoice;
}

export async function get(id: string): Promise<Invoice | undefined> {
  return (await read()).invoices.find((i) => i.id === id);
}

/** Scoped by caller: one agent must never read another's invoices. */
export async function list(createdBy: string): Promise<Invoice[]> {
  return (await read()).invoices.filter((i) => i.created_by === createdBy);
}

export async function markPaid(id: string, createdBy: string): Promise<Invoice | undefined> {
  const db = await read();
  const invoice = db.invoices.find((i) => i.id === id && i.created_by === createdBy);
  if (!invoice) return undefined;
  invoice.paid = true;
  await write(db);
  return invoice;
}

/** Count of invoices this caller has created — drives the free-tier gate. */
export async function usageCount(createdBy: string): Promise<number> {
  return (await read()).invoices.filter((i) => i.created_by === createdBy).length;
}
