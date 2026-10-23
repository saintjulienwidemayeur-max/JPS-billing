// Every payment that really came in: payments on receipts and orders (not credit being used), plus overpayments kept as credit, minus credit given back (a refund is a negative line).
import { db, wrCode, r2, timeMin } from "./wh-store";
import { usToIso } from "./clock";

export type Pay = { customer: string; cust: number; rep: string; label: string; href: string; loc: string; p: { date: string; time?: string; amount: number; method: string; ref: string } };
export function allPayments(): Pay[] {
  return [
    ...db.wrs.flatMap((w) => w.payments.map((p, i) => ({ customer: w.customer, cust: w.cust, rep: w.rep, label: wrCode(w), href: p.batch ? `/payments/${p.batch}` : `/receipts/${w.id}/payments/${i}`, loc: w.route || w.dest || "No location", p }))),
    ...db.orders.flatMap((o) => o.payments.map((p, i) => ({ customer: o.customer, cust: o.cust, rep: o.rep, label: `Order #${o.id}`, href: `/orders/${o.id}/payments/${i}`, loc: db.customers.find((c) => c.no === o.cust)?.route || "No location", p }))),
    ...db.debts.flatMap((d) => d.payments.map((p) => ({ customer: d.customer, cust: d.cust, rep: d.rep, label: `Account balance ${d.id}`, href: p.batch ? `/payments/${p.batch}` : `/customers/${d.cust}`, loc: db.customers.find((c) => c.no === d.cust)?.route || "No location", p }))),
    ...db.customers.flatMap((c) => (c.creditLog ?? []).filter((e) => e.amount !== 0 && e.method).map((e) => ({ customer: c.name, cust: c.no, rep: c.rep, label: e.amount < 0 ? "Refund of credit" : "Credit", href: e.batch ? `/payments/${e.batch}` : `/customers/${c.no}`, loc: c.route || "No location", p: { date: e.date, time: e.time, amount: e.amount, method: e.method!, ref: e.ref ?? "" } }))),
  ].filter((x) => x.p.method !== "Customer credit").sort((a, b) => usToIso(a.p.date).localeCompare(usToIso(b.p.date)) || timeMin(a.p.time) - timeMin(b.p.time));
}
export const sumBy = (list: Pay[], key: (x: Pay) => string) => { const m = new Map<string, number>(); for (const x of list) m.set(key(x), r2((m.get(key(x)) ?? 0) + x.p.amount)); return [...m].sort((a, b) => b[1] - a[1]); };
export const locations = () => [...new Set(allPayments().map((x) => x.loc))].sort();
