import { db, balance, orderBalance, debtBalance, priced } from "@/lib/wh-store";
import { daysSince } from "@/lib/clock";
import { tryLoaded } from "@/lib/persist";

export const dynamic = "force-dynamic";
const q = (v: string | number | undefined) => `"${String(v).replace(/"/g, '""')}"`;

// Everything that is still unpaid, one line each (receipts, orders, account balances), with its age in days: for Excel.
export async function GET() {
  await tryLoaded();
  const rows: (string | number)[][] = [
    ...db.wrs.filter((w) => priced(w) && balance(w) > 0).map((w) => [w.cust, w.customer, w.invoice ? "Invoice" : "Receipt (not invoiced)", w.invoice ?? `${w.ship === "Ocean" ? "JPL" : "JPF"}-${w.id}`, w.date, daysSince(w.date), balance(w)]),
    ...db.orders.filter((o) => orderBalance(o) > 0).map((o) => [o.cust, o.customer, "Order", o.id, o.date, daysSince(o.date), orderBalance(o)]),
    ...db.debts.filter((d) => debtBalance(d) > 0).map((d) => [d.cust, d.customer, "Account balance", d.note, d.date, daysSince(d.date), debtBalance(d)]),
  ];
  const csv = "﻿" + ["customer_no,customer,type,reference,date,days,balance", ...rows.sort((a, b) => Number(b[5]) - Number(a[5])).map((r) => r.map(q).join(","))].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="receivables.csv"' } });
}
