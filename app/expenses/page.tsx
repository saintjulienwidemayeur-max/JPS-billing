import { db, money, r2, total, expenseOf, CARGO_EXPENSE_CATEGORIES, DAILY_EXPENSE_CATEGORIES } from "@/lib/wh-store";
import { isoToday, usToIso } from "@/lib/clock";
import { addExpense, deleteExpense } from "@/lib/billing-actions";
import { PrintButton } from "@/components/print-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Expenses · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";
const sel = "h-9 w-full rounded-md border bg-white px-2 text-sm";
const F = ({ label, children, span }: { label: string; children: React.ReactNode; span?: string }) => <label className={`grid gap-1 text-xs font-medium text-zinc-600 ${span ?? ""}`}>{label}{children}</label>;
const tab = (on: boolean) => `inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium ${on ? "border-brand bg-brand text-white" : "border-zinc-300 bg-white hover:bg-zinc-100"}`;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const today = isoToday(), month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : today.slice(0, 7);
  const view = q.view ?? "all"; // all | daily | <cargo name>
  const iso = (d: string) => usToIso(d);
  const inMonth = (d: string) => iso(d).startsWith(month);
  const shown = db.expenses.filter((e) => (view === "all" ? true : view === "daily" ? !e.shipment : e.shipment === view) && (view !== "all" && view !== "daily" ? true : inMonth(e.date))).sort((a, b) => iso(b.date).localeCompare(iso(a.date)) || b.id.localeCompare(a.id));
  const sum = (l: { amount: number }[]) => r2(l.reduce((a, e) => a + e.amount, 0));
  const monthAll = db.expenses.filter((e) => inMonth(e.date));
  const dailyMonth = monthAll.filter((e) => !e.shipment), cargoMonth = monthAll.filter((e) => e.shipment);
  // Per cargo: what it cost (expenses + bills tied to it) against what customers were billed for it.
  const cargos = [...db.shipments].reverse().map((sh) => {
    const ids = [...new Set(db.loads.filter((l) => l.shipment === sh.name).map((l) => l.wr))];
    const billed = r2(ids.map((id) => db.wrs.find((w) => w.id === id)).reduce((a, w) => a + (w ? total(w) : 0), 0));
    const cost = expenseOf(sh.name);
    return { sh, billed, cost, n: db.expenses.filter((e) => e.shipment === sh.name).length };
  }).filter((c) => c.cost > 0 || c.sh.name === view);
  // Everyday expenses by day, for the month.
  const days = new Map<string, number>();
  for (const e of dailyMonth) days.set(e.date, r2((days.get(e.date) ?? 0) + e.amount));
  const cats = new Map<string, number>();
  for (const e of shown) cats.set(e.category, r2((cats.get(e.category) ?? 0) + e.amount));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <div className="no-print"><h1>Expenses</h1>
        <p className="text-zinc-600">Everything JP&apos;s spends that is not a supplier bill to follow up: the costs of one <strong>cargo</strong> (flight, vessel, customs, pallets...) and the small <strong>everyday</strong> expenses (fuel, meals, supplies...). Pick the cargo it is for, or leave &quot;Everyday&quot;.</p></div>
      {q.err && <p role="alert" className="no-print mt-2 font-medium text-red-700">{q.err}</p>}
      {q.ok && <p role="status" className="no-print mt-2 font-medium text-green-700">{q.ok}</p>}

      <form action={addExpense} className="no-print mt-4 grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-4">
        <h2 className="font-bold sm:col-span-4">New expense</h2>
        <F label="Date"><Input name="date" type="date" defaultValue={today} required /></F>
        <F label="Amount ($)"><Input name="amount" type="number" step="0.01" min="0.01" required className="text-right" /></F>
        <F label="For" span="sm:col-span-2"><select name="shipment" defaultValue={view !== "all" && view !== "daily" ? view : ""} className={sel}>
          <option value="">Everyday (not for a cargo)</option>
          {db.shipments.length > 0 && <optgroup label="A cargo">{[...db.shipments].reverse().map((s) => <option key={s.name} value={s.name}>{s.name} · {s.ship}{s.shipped ? "" : " · open"}</option>)}</optgroup>}
        </select></F>
        <F label="What it was for (category)"><Input name="category" list="expCats" required maxLength={40} placeholder="Fuel, Customs..." /></F>
        <F label="Paid to"><Input name="payee" maxLength={80} /></F>
        <F label="Paid by"><Input name="method" list="payMethods" maxLength={30} placeholder="Cash, card..." /></F>
        <F label="Notes"><Input name="notes" maxLength={200} /></F>
        <div className="sm:col-span-4"><Button type="submit">Save the expense</Button> <span className="text-xs text-zinc-500">Categories: pick one from the list for a cargo or an everyday expense, or type your own.</span></div>
      </form>
      <datalist id="expCats">{[...CARGO_EXPENSE_CATEGORIES, ...DAILY_EXPENSE_CATEGORIES].map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="payMethods">{db.payMethods.map((m) => <option key={m} value={m} />)}</datalist>

      <section className="no-print mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">Everyday · {month}</div><div className="text-2xl font-bold">{money(sum(dailyMonth))}</div><div className="text-xs text-zinc-500">{dailyMonth.length} expense{dailyMonth.length === 1 ? "" : "s"}</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">Cargo · {month}</div><div className="text-2xl font-bold">{money(sum(cargoMonth))}</div><div className="text-xs text-zinc-500">{cargoMonth.length} expense{cargoMonth.length === 1 ? "" : "s"}</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">Total · {month}</div><div className="text-2xl font-bold">{money(sum(monthAll))}</div></div>
      </section>

      <div className="no-print mt-5 flex flex-wrap items-center gap-2">
        <a href={`/expenses?view=all&month=${month}`} className={tab(view === "all")}>All</a>
        <a href={`/expenses?view=daily&month=${month}`} className={tab(view === "daily")}>Everyday</a>
        <form className="flex items-center gap-1"><select name="view" defaultValue={view !== "all" && view !== "daily" ? view : ""} className={sel} aria-label="A cargo"><option value="">A cargo...</option>{[...db.shipments].reverse().map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select><Button type="submit" variant="outline">Show</Button></form>
        <form className="ml-auto flex items-center gap-1"><input type="hidden" name="view" value={view} /><Input name="month" type="month" defaultValue={month} aria-label="Month" /><Button type="submit" variant="outline">Month</Button></form>
        <PrintButton label="Print" />
      </div>

      <h2 className="mt-5 font-bold">{view === "all" ? `All expenses · ${month}` : view === "daily" ? `Everyday expenses · ${month}` : `Cargo ${view}`} <span className="font-normal text-zinc-600">· {money(sum(shown))}</span></h2>
      {shown.length === 0 ? <p className="mt-1 text-zinc-600">No expense.</p> : (
        <table className="mt-2 w-full text-left"><thead className="border-b-2 border-black"><tr>{["Date", "For", "Category", "Paid to", "Paid by", "Notes", "Amount", ""].map((h, i) => <th key={i} className={`${th} ${i === 6 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((e) => (
            <tr key={e.id} className="border-b border-zinc-100 align-top"><td className={`${td} whitespace-nowrap`}>{e.date}</td><td className={td}>{e.shipment ? <a href={`/expenses?view=${encodeURIComponent(e.shipment)}`} className="text-brand underline">{e.shipment}</a> : "Everyday"}</td><td className={td}>{e.category}</td><td className={td}>{e.payee || "–"}</td><td className={td}>{e.method || "–"}</td><td className={`${td} text-xs text-zinc-600`}>{e.notes}{e.by && <span className="block text-zinc-400">{e.by}</span>}</td><td className={`${td} text-right font-medium`}>{money(e.amount)}</td>
              <td className={`${td} no-print`}><form action={deleteExpense.bind(null, e.id)}><button className="text-xs text-red-700 underline" aria-label="Delete this expense">Delete</button></form></td></tr>))}
            <tr className="font-bold"><td className={td} colSpan={6}>Total</td><td className={`${td} text-right`}>{money(sum(shown))}</td><td /></tr></tbody></table>
      )}
      {cats.size > 1 && <p className="mt-2 text-xs text-zinc-600">By category: {[...cats].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${money(v)}`).join(" · ")}</p>}

      {view === "daily" && days.size > 0 && (<>
        <h2 className="mt-6 font-bold">Everyday expenses by day · {month}</h2>
        <table className="mt-2 w-full max-w-sm text-left"><thead><tr><th className={th}>Day</th><th className={`${th} text-right`}>Spent</th></tr></thead>
          <tbody>{[...days].sort((a, b) => iso(b[0]).localeCompare(iso(a[0]))).map(([d, v]) => <tr key={d} className="border-b border-zinc-100"><td className={td}>{d}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}</tbody></table>
      </>)}

      {cargos.length > 0 && (<>
        <h2 className="mt-6 font-bold">Cost of each cargo</h2>
        <p className="text-xs text-zinc-600">Expenses and supplier bills tied to the cargo, against what customers were billed for its receipts. (Rough result: it does not count what is still unpaid by customers.)</p>
        <table className="mt-2 w-full text-left"><thead className="border-b-2 border-black"><tr>{["Cargo", "Expenses", "Billed", "Result"].map((h, i) => <th key={i} className={`${th} ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{cargos.map((c) => (
            <tr key={c.sh.name} className="border-b border-zinc-100"><td className={td}><a href={`/expenses?view=${encodeURIComponent(c.sh.name)}`} className="text-brand underline">{c.sh.name}</a> <span className="text-xs text-zinc-500">{c.sh.ship}</span></td><td className={`${td} text-right`}>{money(c.cost)}</td><td className={`${td} text-right`}>{money(c.billed)}</td><td className={`${td} text-right font-medium ${c.billed - c.cost < 0 ? "text-red-700" : ""}`}>{money(r2(c.billed - c.cost))}</td></tr>))}</tbody></table>
      </>)}
    </main>
  );
}
