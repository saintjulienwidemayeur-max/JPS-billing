import Link from "next/link";
import { WhLink } from "@/components/wh-link";
import { db, creditOf, balance, total, wrCode, money, r2, debtBalance } from "@/lib/wh-store";
import { usToIso } from "@/lib/clock";
import { receivePayment, addPayment, applyCredit } from "@/lib/billing-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Receive payment · JP's Logistics" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1 font-semibold", td = "px-2 py-1";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const inv = q.inv ? db.wrs.find((w) => w.invoice === q.inv) : undefined;
  const c = inv ? db.customers.find((x) => x.no === inv.cust) : db.customers.find((x) => x.no === Number(q.c) || x.name.toLowerCase() === (q.c ?? "").toLowerCase());
  const open = c ? db.wrs.filter((w) => w.cust === c.no && w.fees.length > 0 && balance(w) > 0).sort((a, b) => usToIso(a.date).localeCompare(usToIso(b.date)) || Number(a.id) - Number(b.id)) : [];
  const openDebts = c ? db.debts.filter((d) => d.cust === c.no && debtBalance(d) > 0) : [];
  const owed = r2(open.reduce((a, w) => a + balance(w), 0) + openDebts.reduce((a, d) => a + debtBalance(d), 0));
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1>Enter payments</h1>
      <p className="text-sm text-zinc-600">One payment from a customer is spread over their unpaid receipts and account balances, oldest first. A customer can pay only part: what is not paid stays as the balance. If it is more than they owe, the rest stays as the customer&apos;s credit.</p>
      {q.err && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{q.err}</p>}
      {q.ok && <p role="status" className="mt-2 text-sm font-medium text-green-700">{q.ok}</p>}
      {inv && (
        <section className="mt-4 rounded-lg border border-brand/40 bg-white p-3">
          <h2 className="font-bold">Pay invoice {inv.invoice} <span className="text-sm font-normal text-zinc-500">· {inv.customer} · {wrCode(inv)}</span></h2>
          <p className="mt-1 text-sm">Total <b>{money(total(inv))}</b> · paid <b>{money(inv.payments.reduce((a, p) => a + p.amount, 0))}</b> · balance <b>{money(balance(inv))}</b></p>
          {balance(inv) > 0 ? (
            <form action={addPayment} className="mt-3 grid gap-2 sm:grid-cols-[8rem_12rem_1fr_auto]">
              <input type="hidden" name="wr" value={inv.id} />
              <Input name="amount" type="number" step="0.01" min="0.01" max={balance(inv)} defaultValue={balance(inv)} aria-label="Amount received" required />
              <Input name="method" list="payMethods" placeholder="Paid by (pick or type new)" aria-label="Paid by" maxLength={30} required />
              <Input name="ref" placeholder="Check # or confirmation" aria-label="Reference" />
              <Button type="submit">Enter payment</Button>
              <datalist id="payMethods">{db.payMethods.map((m) => <option key={m} value={m} />)}</datalist>
            </form>
          ) : <p className="mt-2 text-sm font-medium text-green-700">Paid in full.</p>}
          {balance(inv) > 0 && c && creditOf(c) > 0 && (
            <form action={applyCredit.bind(null, inv.id)} className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-green-50 p-2 text-sm">
              <span>The customer has <b>{money(creditOf(c))}</b> of credit.</span>
              <Button type="submit" variant="outline">Use the credit on this invoice</Button>
            </form>
          )}
          <p className="mt-2 text-xs"><Link href={`/invoices/${inv.invoice}`} className="text-brand underline">Back to the invoice</Link></p>
        </section>
      )}
      {q.inv && !inv && <p className="mt-3 text-sm text-red-700">No invoice {q.inv}.</p>}
      <form method="get" className="mt-4 flex gap-2">
        <Input name="c" list="cust" defaultValue={c ? c.name : q.c} placeholder="Customer (name or number)" aria-label="Customer" required />
        <datalist id="cust">{db.customers.map((x) => <option key={x.no} value={x.no}>{x.name}</option>)}</datalist>
        <Button type="submit" variant="outline">Find</Button>
      </form>
      {q.c && !c && <p className="mt-3 text-sm text-red-700">No customer matches &quot;{q.c}&quot;.</p>}
      {c && (
        <section className="mt-5 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{c.name} <span className="text-sm font-normal text-zinc-500">· customer {c.no}</span></h2><Link href={`/customers/${c.no}/statement`} className="text-sm text-brand underline">Statement</Link></div>
          <p className="mt-1 text-sm">Owes <b>{money(owed)}</b> on {open.length} receipt{open.length === 1 ? "" : "s"}{openDebts.length > 0 && ` and ${openDebts.length} account balance${openDebts.length === 1 ? "" : "s"}`} · credit on file <b>{money(creditOf(c))}</b></p>
          {open.length > 0 && (
            <table className="mt-2 w-full text-left text-sm">
              <thead><tr>{["Date", "Receipt", "Invoice", "Total", "Balance"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{open.map((w) => <tr key={w.id} className="border-b border-zinc-100"><td className={td}>{w.date}</td><td className={td}><WhLink path={`/warehouse/receipts/${w.id}`} className="text-brand underline">{wrCode(w)}</WhLink></td><td className={td}>{w.invoice ?? "–"}</td><td className={td}>{money(total(w))}</td><td className={`${td} font-medium`}>{money(balance(w))}</td></tr>)}</tbody>
            </table>
          )}
          {openDebts.length > 0 && <p className="mt-2 text-sm text-zinc-600">Account balances (not on an invoice): {openDebts.map((d) => `${d.note} ${money(debtBalance(d))}`).join(" · ")}. <Link href={`/customers/${c.no}`} className="text-brand underline">Manage</Link></p>}
          <form action={receivePayment} className="mt-4 grid gap-2 sm:grid-cols-[8rem_12rem_1fr_auto]">
            <input type="hidden" name="cust" value={c.no} />
            <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount ($)" aria-label="Amount received" defaultValue={owed > 0 ? owed : undefined} required />
            <Input name="method" list="payMethods" placeholder="Paid by (pick or type new)" aria-label="Paid by" maxLength={30} required />
            <Input name="ref" placeholder="Check # or confirmation" aria-label="Reference" />
            <Button type="submit">Receive payment</Button>
            <datalist id="payMethods">{db.payMethods.map((m) => <option key={m} value={m} />)}</datalist>
          </form>
        </section>
      )}
    </main>
  );
}
