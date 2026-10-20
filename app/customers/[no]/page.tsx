import Link from "next/link";
import { notFound } from "next/navigation";
import { db, balance, total, paidAmt, wrCode, money, r2, creditOf, payStatus, oldBalance, oldOpen, debtBalance, debtPaid } from "@/lib/wh-store";
import { WhLink } from "@/components/wh-link";
import { addDebt, payDebt, deleteDebt } from "@/lib/billing-actions";
import { isoToday } from "@/lib/clock";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type P = Promise<{ no: string }>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export async function generateMetadata({ params }: { params: P }) { return { title: `Customer ${(await params).no} · JP's Billing` }; }

export default async function Page({ params }: { params: P }) {
  const no = Number((await params).no);
  const c = db.customers.find((x) => x.no === no);
  if (!c) notFound();
  const wrs = db.wrs.filter((w) => w.cust === no && w.fees.length > 0);
  const invoiced = wrs.filter((w) => w.invoice), notInvoiced = wrs.filter((w) => !w.invoice && w.pieces.length > 0);
  const billed = r2(invoiced.reduce((a, w) => a + total(w), 0)), paid = r2(invoiced.reduce((a, w) => a + paidAmt(w), 0)), invOwes = r2(invoiced.reduce((a, w) => a + Math.max(0, balance(w)), 0)), debts = db.debts.filter((d) => d.cust === no), debtOwed = r2(debts.reduce((a, d) => a + Math.max(0, debtBalance(d)), 0)), owes = r2(invOwes + debtOwed);
  const olds = db.oldInvoices.filter((o) => o.cust === no), oldOwed = r2(olds.filter(oldOpen).reduce((a, o) => a + oldBalance(o), 0));
  const pays = wrs.flatMap((w) => w.payments.map((p, i) => ({ w, p, i }))).sort((a, b) => b.p.date.localeCompare(a.p.date));
  const stat = "rounded-lg border bg-white p-3";
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <Link href="/customers" className="text-brand underline">All customers</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div><h1>{c.name} <span className="text-base font-normal text-zinc-500">· customer {c.no}</span></h1>
          <p className="text-zinc-600">{[c.phone, c.email, c.box && `Box ${c.box}`].filter(Boolean).join(" · ") || "No contact details"}</p>
          {c.billing && <p className="text-zinc-600">{c.billing}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/payments?c=${c.no}`} className="inline-flex h-9 items-center rounded-md bg-brand px-4 font-medium text-white">Enter payment</Link>
          <Link href={`/customers/${c.no}/statement`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 font-medium">Statement</Link>
          <WhLink path={`/warehouse/customers/${c.no}`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 font-medium">Customer record</WhLink>
        </div>
      </div>
      <section className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className={stat}><div className="text-xs text-zinc-500">Owes now</div><div className={`text-2xl font-bold ${owes > 0 ? "text-red-700" : ""}`}>{money(owes)}</div><div className="text-xs text-zinc-500">{invoiced.filter((w) => balance(w) > 0).length} open invoice(s){debtOwed > 0 && ` · ${money(debtOwed)} account balance`}</div></div>
        <div className={stat}><div className="text-xs text-zinc-500">Invoiced</div><div className="text-2xl font-bold">{money(billed)}</div><div className="text-xs text-zinc-500">{invoiced.length} invoice(s)</div></div>
        <div className={stat}><div className="text-xs text-zinc-500">Paid</div><div className="text-2xl font-bold">{money(paid)}</div></div>
        <div className={stat}><div className="text-xs text-zinc-500">Credit held</div><div className="text-2xl font-bold">{money(creditOf(c))}</div></div>
      </section>
      {olds.length > 0 && <p className="mt-3 rounded-lg border bg-white p-3">Old system: <b>{olds.length}</b> invoice(s), <b className={oldOwed > 0 ? "text-red-700" : ""}>{money(oldOwed)}</b> still owed. <Link href={`/oldinvoices?c=${c.no}`} className="text-brand underline">See them</Link></p>}

      <h2 className="mt-6 font-bold">Invoices</h2>
      {invoiced.length === 0 ? <p className="mt-1 text-zinc-600">No invoice yet.</p> : (
        <table className="mt-2 w-full text-left"><thead><tr>{["Invoice", "Date", "Receipt", "Status", "Total", "Paid", "Balance", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{invoiced.map((w) => (
            <tr key={w.id} className="border-b border-zinc-100"><td className={`${td} whitespace-nowrap font-semibold`}><Link href={`/invoices/${w.invoice}`} className="text-brand underline">{w.invoice}</Link></td><td className={td}>{w.invoiceDate ?? w.date}</td><td className={`${td} whitespace-nowrap`}>{wrCode(w)}</td><td className={td}>{payStatus(w)}</td>
              <td className={td}>{money(total(w))}</td><td className={td}>{money(paidAmt(w))}</td><td className={`${td} font-medium ${balance(w) > 0 ? "text-red-700" : "text-green-700"}`}>{money(balance(w))}</td>
              <td className={td}>{balance(w) > 0 && <Link href={`/payments?inv=${w.invoice}`} className="text-brand underline">Pay</Link>}</td></tr>))}</tbody></table>
      )}
      {notInvoiced.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">{notInvoiced.length} receipt(s) not invoiced yet ({notInvoiced.map(wrCode).join(", ")}). <Link href={`/invoices/new?c=${c.no}`} className="text-brand underline">Make the invoice</Link></p>
      )}

      <section className="mt-6 rounded-lg border bg-white p-3">
        <h2 className="font-bold">Account balance <span className="text-sm font-normal text-zinc-500">· what the customer owes that is not on an invoice</span></h2>
        <p className="mt-1 text-xs text-zinc-600">A previous balance, an old debt, a loan... The customer can pay part of it: what is not paid stays as the balance. A payment entered for the customer (Enter payment) pays the oldest amounts first, invoices and account balances together.</p>
        {debts.length > 0 && (
          <table className="mt-2 w-full text-left"><thead><tr>{["Date", "For", "Amount", "Paid", "Balance", "Pay a part", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
            <tbody>{debts.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 align-top"><td className={`${td} whitespace-nowrap`}>{d.date}</td><td className={td}>{d.note}<span className="block text-xs text-zinc-400">{d.id}</span>{d.payments.map((p, i) => <span key={i} className="block text-xs text-zinc-500">{p.date} · {money(p.amount)} · {p.method}{p.batch && <> · <Link href={`/payments/${p.batch}`} className="text-brand underline">receipt</Link></>}</span>)}</td><td className={td}>{money(d.amount)}</td><td className={td}>{money(debtPaid(d))}</td><td className={`${td} font-medium ${debtBalance(d) > 0 ? "text-red-700" : "text-green-700"}`}>{money(debtBalance(d))}</td>
                <td className={td}>{debtBalance(d) > 0 && <form action={payDebt} className="flex gap-1"><input type="hidden" name="id" value={d.id} /><Input name="amount" type="number" step="0.01" min="0.01" max={debtBalance(d)} defaultValue={debtBalance(d)} className="w-24 text-right" aria-label="Amount paid" required /><Input name="method" list="payMethods" placeholder="Paid by" className="w-28" aria-label="Paid by" maxLength={30} required /><Button type="submit" variant="outline">Pay</Button></form>}</td>
                <td className={td}>{d.payments.length === 0 && <form action={deleteDebt.bind(null, d.id)}><button className="text-xs text-red-700 underline">Delete</button></form>}</td></tr>))}</tbody></table>
        )}
        <form action={addDebt} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[8rem_9rem_1fr_auto]">
          <input type="hidden" name="cust" value={c.no} />
          <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount owed ($)" aria-label="Amount owed" className="text-right" required />
          <Input name="date" type="date" defaultValue={isoToday()} aria-label="Date" />
          <Input name="note" placeholder="What it is for (previous balance, old debt...)" aria-label="What it is for" maxLength={120} required />
          <Button type="submit">Add the balance</Button>
        </form>
        <datalist id="payMethods">{db.payMethods.map((m) => <option key={m} value={m} />)}</datalist>
      </section>

      <h2 className="mt-6 font-bold">Payments</h2>
      {pays.length === 0 ? <p className="mt-1 text-zinc-600">No payment yet.</p> : (
        <table className="mt-2 w-full text-left"><thead><tr>{["Date", "Receipt", "Method", "Reference", "Amount", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{pays.map(({ w, p, i }) => (
            <tr key={`${w.id}-${i}`} className="border-b border-zinc-100"><td className={td}>{p.date}{p.time && ` ${p.time}`}</td><td className={td}>{wrCode(w)}</td><td className={td}>{p.method}</td><td className={td}>{p.ref || "–"}</td><td className={td}>{money(p.amount)}</td>
              <td className={td}><Link href={p.batch ? `/payments/${p.batch}` : `/receipts/${w.id}/payments/${i}`} className="text-brand underline">Receipt</Link></td></tr>))}</tbody></table>
      )}
    </main>
  );
}
