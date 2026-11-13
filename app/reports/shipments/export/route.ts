import { db, total, paidAmt, balance, wrCode, receiverOf, cuft, chargeable, credits, insuranceFee, shipName, r2, type WR } from "@/lib/wh-store";
import { tryLoaded } from "@/lib/persist";

export const dynamic = "force-dynamic";
// Text that starts with = + - @ would run as a formula in Excel: a quote mark in front makes it plain text.
const q = (v: string | number | undefined) => `"${(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v ?? "")).replace(/"/g, '""')}"`;

// The shipment report for accounting, as a CSV file (Excel): one line per receipt (invoice) and customer of the cargo, with every detail. ?ship=NAME for one cargo, no ship for all of them.
export async function GET(req: Request) {
  await tryLoaded();
  const only = new URL(req.url).searchParams.get("ship") ?? "";
  const shipments = db.shipments.filter((s) => !only || s.name === only);
  const head = ["Invoice Number", "Invoice Date", "Shipment ID", "Cust No", "CustPaying", "CustReceiving", "Pay Method", "WRs", "Ship Type", "Pieces Shipped", "Lbs", "CuFt", "Sub Charge", "Chg Unit", "Rate Applied", "Sub Total", "Handling Fees", "Insurance", "Other Fees", "Other Credit", "Payment Applied", "Total", "Balance", "Payment Dates", "Reference"];
  const lines: string[] = [], tot = { p: 0, lbs: 0, cu: 0, sub: 0, h: 0, ins: 0, o: 0, c: 0, paid: 0, t: 0, b: 0 };
  for (const sh of shipments) {
    const loads = db.loads.filter((l) => l.shipment === sh.name), ids = [...new Set(loads.map((l) => l.wr))];
    const wrs = ids.map((id) => db.wrs.find((w) => w.id === id)).filter((w): w is WR => !!w).sort((a, b) => (a.invoice ?? "~").localeCompare(b.invoice ?? "~", undefined, { numeric: true }));
    for (const w of wrs) {
      const mine = loads.filter((l) => l.wr === w.id).map((l) => w.pieces.find((p) => p.no === l.no)).filter((p): p is NonNullable<typeof p> => !!p);
      const first = db.loads.find((l) => l.wr === w.id)?.shipment === sh.name; // fees, payments and totals count once: in the first shipment of a split receipt
      const ocean = w.ship === "Ocean", qty = r2(mine.reduce((a, p) => a + (ocean ? cuft(p) : chargeable(p)), 0)), rate = w.rate ?? 0;
      const sub = r2(qty * rate), lbs = r2(mine.reduce((a, p) => a + p.lbs, 0)), cu = r2(mine.reduce((a, p) => a + cuft(p), 0));
      const hand = first ? r2(w.fees.filter((f) => f.kind === "charge" && f.auto === "handling").reduce((a, f) => a + f.amount, 0)) : 0;
      const other = first ? r2(w.fees.filter((f) => f.kind === "charge" && f.auto !== "handling").reduce((a, f) => a + f.amount, 0)) : 0;
      const ins = first ? insuranceFee(w) : 0, cr = first ? r2(credits(w)) : 0, paid = first ? paidAmt(w) : 0, tt = first ? total(w) : 0, bal = first ? balance(w) : 0;
      tot.p += mine.length; tot.lbs += lbs; tot.cu += cu; tot.sub += sub; tot.h += hand; tot.ins += ins; tot.o += other; tot.c += cr; tot.paid += paid; tot.t += tt; tot.b += bal;
      lines.push([w.invoice ?? "(not invoiced)", w.invoiceDate ?? "", sh.name, w.cust, w.customer, receiverOf(w).name, [...new Set(w.payments.map((p) => p.method))].join(" / "), wrCode(w), shipName(w), mine.length, lbs, cu, qty, ocean ? "cuft" : "lbs", rate, sub, hand, ins, other, cr, paid, tt, bal, w.payments.map((p) => p.date).join(" / "), w.payments.map((p) => p.ref).filter(Boolean).join(" / ")].map(q).join(","));
    }
  }
  const r = (n: number) => r2(n);
  lines.push(["TOTAL", "", only || "All shipments", "", "", "", "", "", "", tot.p, r(tot.lbs), r(tot.cu), "", "", "", r(tot.sub), r(tot.h), r(tot.ins), r(tot.o), r(tot.c), r(tot.paid), r(tot.t), r(tot.b), "", ""].map(q).join(","));
  const csv = "﻿" + [head.map(q).join(","), ...lines].join("\r\n");
  const file = `Shipment-report-${(only || "all").replace(/[^A-Za-z0-9._-]+/g, "_")}.csv`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}"` } });
}
