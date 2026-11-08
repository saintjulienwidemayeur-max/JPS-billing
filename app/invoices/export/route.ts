import { total, paidAmt, balance, wrCode } from "@/lib/wh-store";
import { invoiceRows, dims, reportTotals } from "@/lib/invoice-report";
import { tryLoaded } from "@/lib/persist";

export const dynamic = "force-dynamic";
// Text that starts with = + - @ would run as a formula in Excel (a customer called "=HYPERLINK(...)"): a quote mark in front makes it plain text.
const q = (v: string | number | undefined) => `"${(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v)).replace(/"/g, '""')}"`;

// All invoices as a CSV file (for Excel): signed-in people only (the middleware checks the cookie).
export async function GET(req: Request) {
  await tryLoaded();
  const ws = invoiceRows(Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>), t = reportTotals(ws);
  const rows = ws.map((w) => [w.invoice ?? "", w.invoiceDate ?? w.date, wrCode(w), w.cust, w.customer, w.ship, dims(w).pieces, dims(w).lbs, dims(w).cuft, total(w), paidAmt(w), balance(w)].map(q).join(","));
  const csv = "﻿" + ["invoice,date,receipt,customer_no,customer,ship,pieces,lbs,cu_ft,total,paid,balance", ...rows, ["TOTAL", "", "", "", "", "", t.pieces, t.lbs, t.cuft, t.amount, t.paid, t.balance].map(q).join(",")].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="invoices.csv"' } });
}
