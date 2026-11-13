// The invoice report: the invoices that match the filters of the Invoices page, and the final totals (dimensions and amounts).
import { db, total, paidAmt, balance, cuft, r2, type WR } from "./wh-store";

export type InvQ = Record<string, string | undefined>;
export function invoiceRows(q: InvQ): WR[] {
  const cust = (q.customer ?? "").trim().toLowerCase();
  const onShip = q.shipment ? new Set(db.loads.filter((l) => l.shipment === q.shipment).map((l) => l.wr)) : undefined;
  return db.wrs.filter((w) => w.invoice
    && (!onShip || onShip.has(w.id))
    && (!q.ship || w.ship === q.ship)
    && (!q.rep || w.rep === q.rep)
    && (!cust || w.customer.toLowerCase().includes(cust) || String(w.cust) === cust)
    && (!q.status || (q.status === "paid" ? balance(w) <= 0 : balance(w) > 0)));
}
export const dims = (w: WR) => ({ pieces: w.pieces.length, lbs: r2(w.pieces.reduce((a, p) => a + p.lbs, 0)), cuft: r2(w.pieces.reduce((a, p) => a + cuft(p), 0)) });
export function reportTotals(rows: WR[]) {
  const d = rows.map(dims);
  return { invoices: rows.length, pieces: d.reduce((a, x) => a + x.pieces, 0), lbs: r2(d.reduce((a, x) => a + x.lbs, 0)), cuft: r2(d.reduce((a, x) => a + x.cuft, 0)), amount: r2(rows.reduce((a, w) => a + total(w), 0)), paid: r2(rows.reduce((a, w) => a + paidAmt(w), 0)), balance: r2(rows.reduce((a, w) => a + balance(w), 0)) };
}
