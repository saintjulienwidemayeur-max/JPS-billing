import { db, total, paidAmt, balance, wrCode } from "@/lib/wh-store";
import { tryLoaded } from "@/lib/persist";

export const dynamic = "force-dynamic";
// Text that starts with = + - @ would run as a formula in Excel (a customer called "=HYPERLINK(...)"): a quote mark in front makes it plain text.
const q = (v: string | number | undefined) => `"${(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v)).replace(/"/g, '""')}"`;

// All invoices as a CSV file (for Excel): signed-in people only (the middleware checks the cookie).
export async function GET() {
  await tryLoaded();
  const rows = db.wrs.filter((w) => w.invoice).map((w) => [w.invoice ?? "", w.invoiceDate ?? w.date, wrCode(w), w.cust, w.customer, w.ship, total(w), paidAmt(w), balance(w)].map(q).join(","));
  const csv = "﻿" + ["invoice,date,receipt,customer_no,customer,ship,total,paid,balance", ...rows].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="invoices.csv"' } });
}
