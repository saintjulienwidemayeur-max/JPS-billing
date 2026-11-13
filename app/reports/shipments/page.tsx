import Link from "next/link";
import { db, expenseOf, total, paidAmt, balance, money, r2, chargeable, cuft, shToUSA } from "@/lib/wh-store";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Shipments report · JP's Billing" };
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page() {
  // A receipt belongs to the shipment its pieces are loaded on (a receipt split over two shipments counts in the first).
  const rows = [...db.shipments].reverse().map((sh) => {
    const loads = db.loads.filter((l) => l.shipment === sh.name), ids = [...new Set(loads.map((l) => l.wr))];
    const wrs = ids.map((id) => db.wrs.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
    const lbs = r2(loads.reduce((a, l) => { const w = db.wrs.find((x) => x.id === l.wr); const p = w?.pieces.find((x) => x.no === l.no); return a + (p ? chargeable(p) : 0); }, 0));
    const cu = r2(loads.reduce((a, l) => { const w = db.wrs.find((x) => x.id === l.wr); const p = w?.pieces.find((x) => x.no === l.no); return a + (p ? cuft(p) : 0); }, 0));
    return { sh, pieces: loads.length, lbs, cu, wrs, billed: r2(wrs.reduce((a, w) => a + total(w), 0)), paid: r2(wrs.reduce((a, w) => a + paidAmt(w), 0)), owed: r2(wrs.reduce((a, w) => a + Math.max(0, balance(w)), 0)), cost: expenseOf(sh.name), noInvoice: wrs.filter((w) => !w.invoice).length };
  });
  const tp = rows.reduce((a, r) => a + r.pieces, 0), tl = r2(rows.reduce((a, r) => a + r.lbs, 0)), tc = r2(rows.reduce((a, r) => a + r.cu, 0));
  const sum = (k: "billed" | "paid" | "owed") => r2(rows.reduce((a, r) => a + r[k], 0));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <div className="no-print"><h1>Shipments report</h1><p className="text-zinc-600">What each shipment billed to customers, what was paid and what is still owed. Cost = the expenses and supplier bills tied to that shipment (Expenses, Payables).</p><div className="mt-2"><PrintButton label="Print the report" /> <a href="/reports/shipments/export" className="no-print ml-2 inline-flex h-9 items-center rounded-md border border-brand px-3 font-medium text-brand">Download all (Excel)</a></div></div>
      {rows.length === 0 ? <p className="mt-4 text-zinc-600">No shipment yet.</p> : (
        <table className="mt-4 w-full text-left">
          <thead className="border-b-2 border-black"><tr>{["Shipment", "Date", "Receipts", "Pieces", "Billed lb", "Cu ft", "Billed", "Paid", "Owed", "Cost", "Not invoiced", ""].map((h, i) => <th key={i} className={`${th} ${i >= 3 && i <= 9 ? "text-right" : ""} ${i === 11 ? "no-print" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.sh.name} className="border-b border-zinc-200"><td className={`${td} whitespace-nowrap font-medium`}><Link href={`/reports/shipments/${encodeURIComponent(r.sh.name)}`} className="text-brand underline">{r.sh.name}</Link> <span className="text-xs text-zinc-500">{r.sh.ship}{shToUSA(r.sh) ? " · Haiti → Miami" : ""}{r.sh.shipped ? "" : " · open"}</span></td><td className={td}>{r.sh.shipped ?? r.sh.date}</td><td className={td}>{r.wrs.length}</td><td className={`${td} text-right`}>{r.pieces}</td><td className={`${td} text-right`}>{r.lbs}</td><td className={`${td} text-right`}>{r.cu}</td><td className={`${td} text-right`}>{money(r.billed)}</td><td className={`${td} text-right`}>{money(r.paid)}</td><td className={`${td} text-right font-medium ${r.owed > 0 ? "text-red-700" : ""}`}>{money(r.owed)}</td><td className={`${td} text-right`}>{r.cost ? money(r.cost) : "–"}</td><td className={td}>{r.noInvoice > 0 ? <Link href="/invoices/new" className="text-brand underline">{r.noInvoice}</Link> : "–"}</td><td className="no-print whitespace-nowrap px-2 py-1.5"><a href={`/reports/shipments/export?ship=${encodeURIComponent(r.sh.name)}`} className="font-medium text-brand underline">Download</a> <Link href={`/reports/shipments/${encodeURIComponent(r.sh.name)}`} className="ml-2 font-medium text-brand underline">Open</Link></td></tr>))}
            <tr className="font-bold"><td className={td} colSpan={3}>Total ({rows.length} shipments)</td><td className={`${td} text-right`}>{tp}</td><td className={`${td} text-right`}>{tl}</td><td className={`${td} text-right`}>{tc}</td><td className={`${td} text-right`}>{money(sum("billed"))}</td><td className={`${td} text-right`}>{money(sum("paid"))}</td><td className={`${td} text-right`}>{money(sum("owed"))}</td><td className={`${td} text-right`}>{money(r2(rows.reduce((a, r) => a + r.cost, 0)))}</td><td /><td className="no-print" /></tr></tbody>
        </table>
      )}
    </main>
  );
}
