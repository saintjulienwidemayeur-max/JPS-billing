import Link from "next/link";
import { notFound } from "next/navigation";
import { db, expenseOf, total, paidAmt, balance, money, r2, chargeable, cuft, wrCode, shToUSA, type WR } from "@/lib/wh-store";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Shipment · JP's Billing" };
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

// What is inside one shipment (cargo): every customer and receipt loaded on it, with pieces, weight, cubic feet and what is billed, paid and owed.
export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const sh = db.shipments.find((x) => x.name === name);
  if (!sh) notFound();
  const loads = db.loads.filter((l) => l.shipment === name), ids = [...new Set(loads.map((l) => l.wr))];
  const wrs = ids.map((id) => db.wrs.find((w) => w.id === id)).filter((w): w is WR => !!w).sort((a, b) => a.customer.localeCompare(b.customer) || Number(a.id) - Number(b.id));
  const rows = wrs.map((w) => {
    const mine = loads.filter((l) => l.wr === w.id).map((l) => w.pieces.find((p) => p.no === l.no)).filter((p): p is NonNullable<typeof p> => !!p);
    const first = db.loads.find((l) => l.wr === w.id)?.shipment === name; // money counts once: in the first shipment of a split receipt
    return { w, pieces: mine.length, of: w.pieces.length, lbs: r2(mine.reduce((a, p) => a + p.lbs, 0)), chg: r2(mine.reduce((a, p) => a + chargeable(p), 0)), cu: r2(mine.reduce((a, p) => a + cuft(p), 0)), billed: first ? total(w) : 0, paid: first ? paidAmt(w) : 0, owed: first ? Math.max(0, balance(w)) : 0, first };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => r2(rows.reduce((a, r) => a + f(r), 0));
  const customers = new Set(wrs.map((w) => w.cust)).size, enc = encodeURIComponent(name);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h1>{sh.name}</h1><p className="text-zinc-600">{sh.ship} · {shToUSA(sh) ? "Haiti → Miami" : sh.dir === "DR" ? "Miami → DR (SDQ)" : "Miami → Haiti"} · created {sh.date} · {sh.shipped ? `shipped ${sh.shipped}` : "open"} · cargo {sh.cargoId}</p></div>
        <div className="no-print flex flex-wrap items-center gap-2"><Link href="/reports/shipments" className="text-brand underline">All shipments</Link><a href={`/reports/shipments/export?ship=${enc}`} className="inline-flex h-9 items-center rounded-md border border-brand px-3 font-medium text-brand">Download (Excel)</a><PrintButton /></div>
      </div>
      <section className="mt-4 grid gap-3 sm:grid-cols-4">
        {[["Customers", String(customers)], ["Receipts", String(rows.length)], ["Pieces", String(sum((r) => r.pieces))], ["Weight", `${sum((r) => r.lbs)} lbs`], ["Cubic feet", `${sum((r) => r.cu)} cu ft`], ["Billed", money(sum((r) => r.billed))], ["Paid", money(sum((r) => r.paid))], ["Owed", money(sum((r) => r.owed))]].map(([k, v]) => <div key={k} className="rounded-lg border bg-white p-3"><div className="text-xs text-zinc-500">{k}</div><div className="text-xl font-bold">{v}</div></div>)}
      </section>
      <p className="mt-2 text-xs text-zinc-600">Cost of this shipment (expenses and supplier bills tied to it): <b>{money(expenseOf(name))}</b></p>
      {rows.length === 0 ? <p className="mt-4 text-zinc-600">Nothing is loaded on this shipment yet.</p> : (
        <table className="mt-4 w-full text-left">
          <thead className="border-b-2 border-black"><tr>{["Customer", "Receipt", "Invoice", "Pieces", "Lbs", "Cu ft", "Billed", "Paid", "Owed"].map((h, i) => <th key={h} className={`${th} ${i >= 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(({ w, pieces, of, lbs, cu, billed, paid, owed }) => (
            <tr key={w.id} className="border-b border-zinc-200">
              <td className={td}><Link href={`/customers/${w.cust}`} className="text-brand underline">{w.customer}</Link> <span className="text-xs text-zinc-500">#{w.cust}</span></td>
              <td className={`${td} whitespace-nowrap`}>{wrCode(w)}</td>
              <td className={`${td} whitespace-nowrap`}>{w.invoice ? <Link href={`/invoices/${encodeURIComponent(w.invoice)}`} className="text-brand underline">{w.invoice}</Link> : <Link href={`/invoices/new?q=${w.id}`} className="text-amber-800 underline">not invoiced</Link>}</td>
              <td className={`${td} text-right`}>{pieces}{of > pieces ? <span className="text-xs text-zinc-500"> of {of}</span> : ""}</td><td className={`${td} text-right`}>{lbs}</td><td className={`${td} text-right`}>{cu}</td>
              <td className={`${td} text-right`}>{money(billed)}</td><td className={`${td} text-right`}>{money(paid)}</td><td className={`${td} text-right font-medium ${owed > 0 ? "text-red-700" : ""}`}>{money(owed)}</td>
            </tr>))}
            <tr className="border-t-2 border-black font-bold"><td className={td} colSpan={3}>Total ({customers} customer{customers === 1 ? "" : "s"}, {rows.length} receipt{rows.length === 1 ? "" : "s"})</td><td className={`${td} text-right`}>{sum((r) => r.pieces)}</td><td className={`${td} text-right`}>{sum((r) => r.lbs)}</td><td className={`${td} text-right`}>{sum((r) => r.cu)}</td><td className={`${td} text-right`}>{money(sum((r) => r.billed))}</td><td className={`${td} text-right`}>{money(sum((r) => r.paid))}</td><td className={`${td} text-right`}>{money(sum((r) => r.owed))}</td></tr>
          </tbody>
        </table>
      )}
    </main>
  );
}
