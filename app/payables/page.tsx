import { db, money, r2, billPaid, billBalance, BILL_CATEGORIES } from "@/lib/wh-store";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { isoToday, usToIso } from "@/lib/clock";
import { addBill, payBill, deleteBill } from "@/lib/billing-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Payables · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";
const F = ({ label, children, span }: { label: string; children: React.ReactNode; span?: string }) => <label className={`grid gap-1 text-xs font-medium text-zinc-600 ${span ?? ""}`}>{label}{children}</label>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const today = isoToday();
  const open = db.payables.filter((b) => billBalance(b) > 0).sort((a, b) => usToIso(a.due).localeCompare(usToIso(b.due)));
  const paid = db.payables.filter((b) => billBalance(b) <= 0).slice(0, 30);
  const owed = r2(open.reduce((a, b) => a + billBalance(b), 0)), late = open.filter((b) => usToIso(b.due) < today);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <h1>Bills to pay</h1>
      <p className="text-zinc-600">What JP&apos;s has to pay: the airline, the shipping line, customs, rent, salaries... Enter each bill, then record each payment.</p>
      {q.err && <p role="alert" className="mt-2 font-medium text-red-700">{q.err}</p>}
      {q.ok && <p role="status" className="mt-2 font-medium text-green-700">{q.ok}</p>}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">To pay</div><div className="text-2xl font-bold">{money(owed)}</div><div className="text-xs text-zinc-500">{open.length} bill{open.length === 1 ? "" : "s"}</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">Late</div><div className={`text-2xl font-bold ${late.length ? "text-red-700" : ""}`}>{money(r2(late.reduce((a, b) => a + billBalance(b), 0)))}</div><div className="text-xs text-zinc-500">{late.length} past the due date</div></div>
      </section>

      <form action={addBill} className="mt-5 grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-4">
        <h2 className="font-bold sm:col-span-4">New bill</h2>
        <F label="From (supplier)"><Input name="vendor" required maxLength={80} /></F>
        <F label="Bill number (optional)"><Input name="ref" maxLength={40} /></F>
        <F label="Category"><select name="category" className="h-9 rounded-md border bg-white px-2 text-sm">{BILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></F>
        <F label="Amount ($)"><Input name="amount" type="number" step="0.01" min="0.01" required className="text-right" /></F>
        <F label="Bill date"><Input name="date" type="date" defaultValue={today} /></F>
        <F label="Due date"><Input name="due" type="date" defaultValue={today} /></F>
        <F label="For a cargo (optional)"><select name="shipment" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="">No cargo</option>{[...db.shipments].reverse().map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></F>
        <F label="Notes"><Input name="notes" maxLength={200} /></F>
        <div className="sm:col-span-4"><Button type="submit">Add the bill</Button></div>
      </form>

      <h2 className="mt-6 font-bold">Open bills</h2>
      {open.length === 0 ? <p className="mt-1 text-zinc-600">Nothing to pay.</p> : (
        <table className="mt-2 w-full text-left"><thead><tr>{["Due", "From", "Category", "Bill", "Amount", "Balance", "Pay"].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{open.map((b) => (
            <tr key={b.id} className="border-b border-zinc-100 align-top"><td className={`${td} whitespace-nowrap ${usToIso(b.due) < today ? "font-semibold text-red-700" : ""}`}>{b.due}</td><td className={td}>{b.vendor}{b.shipment && <span className="block text-xs text-zinc-500">Cargo {b.shipment}</span>}{b.notes && <span className="block text-xs text-zinc-500">{b.notes}</span>}</td><td className={td}>{b.category}</td><td className={td}>{b.ref || b.id}</td><td className={td}>{money(b.amount)}{b.payments.length > 0 && <span className="block text-xs text-zinc-500">paid {money(billPaid(b))}: {b.payments.map((p) => `${p.date} ${money(p.amount)} ${p.method}`).join(", ")}</span>}</td><td className={`${td} font-medium`}>{money(billBalance(b))}</td>
              <td className={td}><form action={payBill} className="flex gap-1"><input type="hidden" name="id" value={b.id} /><Input name="amount" type="number" step="0.01" min="0.01" max={billBalance(b)} defaultValue={billBalance(b)} className="w-24 text-right" aria-label="Amount" /><Input name="method" list="payMethods" placeholder="Paid by" className="w-28" required aria-label="Paid by" /><Button type="submit" variant="outline">Pay</Button></form>
                {b.payments.length === 0 && <form action={deleteBill.bind(null, b.id)}><ConfirmSubmit plain className="mt-1 text-xs" message={`Delete the bill of ${b.vendor} (${money(b.amount)})?`}>Delete</ConfirmSubmit></form>}</td></tr>))}</tbody></table>
      )}
      <datalist id="payMethods">{db.payMethods.map((m) => <option key={m} value={m} />)}</datalist>
      {paid.length > 0 && (<>
        <h2 className="mt-6 font-bold">Paid (last {paid.length})</h2>
        <table className="mt-2 w-full text-left"><thead><tr>{["Date", "From", "Bill", "Amount", "Paid by"].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{paid.map((b) => <tr key={b.id} className="border-b border-zinc-100"><td className={td}>{b.payments.at(-1)?.date ?? b.date}</td><td className={td}>{b.vendor}</td><td className={td}>{b.ref || b.id}</td><td className={td}>{money(billPaid(b))}</td><td className={td}>{[...new Set(b.payments.map((p) => p.method))].join(", ")}</td></tr>)}</tbody></table>
      </>)}
    </main>
  );
}
