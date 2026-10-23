import Link from "next/link";
import { db, balance, wrCode, money, r2, repLabel, creditOf, orderBalance, debtBalance, priced, owesOf } from "@/lib/wh-store";
import { isoToday, usToIso, daysSince } from "@/lib/clock";
import { allPayments, type Pay } from "@/lib/paylist";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Billing · JP's Logistics" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1 font-semibold", td = "px-2 py-1";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const today = isoToday(), from = q.from || `${today.slice(0, 8)}01`, to = q.to || today;
  // Money that really came in: payments on receipts and orders (not credit being used) plus overpayments kept as credit.
  const pays = allPayments().filter((x) => usToIso(x.p.date) >= from && usToIso(x.p.date) <= to);
  const sumBy = (key: (x: Pay) => string) => { const m = new Map<string, number>(); for (const x of pays) m.set(key(x), r2((m.get(key(x)) ?? 0) + x.p.amount)); return [...m].sort((a, b) => b[1] - a[1]); };
  const collected = r2(pays.reduce((a, x) => a + x.p.amount, 0));
  const owing = db.wrs.filter((w) => priced(w) && balance(w) > 0), owingDebts = db.debts.filter((d) => debtBalance(d) > 0);
  const buckets = [["0-30 days", 0, 30], ["31-60 days", 31, 60], ["61-90 days", 61, 90], ["Over 90 days", 91, 99999]] as const;
  const owingOrders = db.orders.filter((o) => orderBalance(o) > 0);
  // Every unpaid amount has a date and a balance: receipts, account balances and orders, so the four columns add up to "Still owed".
  const open: { date: string; owed: number }[] = [...owing.map((w) => ({ date: w.date, owed: balance(w) })), ...owingDebts.map((d) => ({ date: d.date, owed: debtBalance(d) })), ...owingOrders.map((o) => ({ date: o.date, owed: orderBalance(o) }))];
  const aged = buckets.map(([label, lo, hi]) => [label, r2(open.filter((x) => { const d = daysSince(x.date); return d >= lo && d <= hi; }).reduce((a, x) => a + x.owed, 0))] as const);
  const outstanding = r2(owing.reduce((a, w) => a + balance(w), 0) + owingOrders.reduce((a, o) => a + orderBalance(o), 0) + owingDebts.reduce((a, d) => a + debtBalance(d), 0));
  const debtors = [...new Map([...owing.map((w) => [w.cust, w.customer] as const), ...owingDebts.map((d) => [d.cust, d.customer] as const), ...owingOrders.map((o) => [o.cust, o.customer] as const)]).entries()].map(([no, name]) => ({ no, name, owed: owesOf(no).total })).sort((a, b) => b.owed - a.owed);
  const credits = r2(db.customers.reduce((a, c) => a + Math.max(0, creditOf(c)), 0));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1>Billing</h1>
        <div className="flex gap-2"><Link href="/payments" className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white">Receive a payment</Link><Link href="/invoices" className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium">Invoices</Link></div></div>
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><div className="text-xs text-zinc-500">Still owed to JP&apos;s</div><div className="text-2xl font-bold">{money(outstanding)}</div><div className="text-xs text-zinc-500">{owing.length} receipt{owing.length === 1 ? "" : "s"} · {owingOrders.length} order{owingOrders.length === 1 ? "" : "s"} · {owingDebts.length} account balance{owingDebts.length === 1 ? "" : "s"} not paid</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-zinc-500">Collected {from} to {to}</div><div className="text-2xl font-bold">{money(collected)}</div><div className="text-xs text-zinc-500">{pays.length} payment{pays.length === 1 ? "" : "s"}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-zinc-500">Customer credit held</div><div className="text-2xl font-bold">{money(credits)}</div></div>
      </section>

      <h2 className="mt-6 font-bold">How old the unpaid balances are <a href="/receivables/export" className="ml-2 text-sm font-medium text-brand underline">Download CSV</a></h2>
      <table className="mt-2 w-full text-left text-sm"><thead><tr>{aged.map(([l]) => <th key={l} className={th}>{l}</th>)}</tr></thead><tbody><tr>{aged.map(([l, v]) => <td key={l} className={`${td} font-medium`}>{money(v)}</td>)}</tr></tbody></table>

      <h2 className="mt-6 font-bold">Who owes</h2>
      {debtors.length === 0 ? <p className="mt-1 text-sm text-zinc-600">Nobody owes anything.</p> : (
        <table className="mt-2 w-full text-left text-sm"><thead><tr>{["Customer", "Owes", "", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{debtors.map((d) => <tr key={d.no} className="border-b border-zinc-100"><td className={td}>{d.name} <span className="text-xs text-zinc-500">#{d.no}</span></td><td className={`${td} font-medium`}>{money(d.owed)}</td><td className={td}><Link href={`/customers/${d.no}/statement`} className="text-brand underline">Statement</Link></td><td className={td}><Link href={`/payments?c=${d.no}`} className="text-brand underline">Receive payment</Link></td></tr>)}</tbody></table>
      )}

      <h2 className="mt-6 font-bold">Payments received</h2>
      <form method="get" className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-600">From <Input name="from" type="date" defaultValue={from} className="w-40" /></label>
        <label className="text-xs text-zinc-600">To <Input name="to" type="date" defaultValue={to} className="w-40" /></label>
        <Button type="submit" variant="outline">Show</Button>
      </form>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <table className="w-full text-left text-sm"><thead><tr><th className={th}>By method</th><th className={`${th} text-right`}>Amount</th></tr></thead><tbody>{sumBy((x) => x.p.method).map(([k, v]) => <tr key={k} className="border-b border-zinc-100"><td className={td}>{k}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}<tr className="font-semibold"><td className={td}>Total</td><td className={`${td} text-right`}>{money(collected)}</td></tr></tbody></table>
        <table className="w-full text-left text-sm"><thead><tr><th className={th}>By representative</th><th className={`${th} text-right`}>Amount</th></tr></thead><tbody>{sumBy((x) => repLabel(x.rep) || "No rep").map(([k, v]) => <tr key={k} className="border-b border-zinc-100"><td className={td}>{k}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}</tbody></table>
      </div>
      {pays.length > 0 && (
        <table className="mt-4 w-full text-left text-sm"><thead><tr>{["Date", "Customer", "Receipt", "Method", "Reference", "Amount", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{[...pays].reverse().map((x, k) => <tr key={k} className="border-b border-zinc-100"><td className={td}>{x.p.date}{x.p.time && ` ${x.p.time}`}</td><td className={td}>{x.customer}</td><td className={td}>{x.label}</td><td className={td}>{x.p.method}</td><td className={td}>{x.p.ref || "–"}</td><td className={td}>{money(x.p.amount)}</td><td className={td}><Link href={x.href} className="text-brand underline">Receipt</Link></td></tr>)}</tbody></table>
      )}
    </main>
  );
}
