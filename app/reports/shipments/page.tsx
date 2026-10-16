import Link from "next/link";
import { db, total, paidAmt, balance, money, r2, chargeable } from "@/lib/wh-store";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Shipments report · JP's Billing" };
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page() {
  // A receipt belongs to the shipment its pieces are loaded on (a receipt split over two shipments counts in the first).
  const rows = [...db.shipments].reverse().map((sh) => {
    const loads = db.loads.filter((l) => l.shipment === sh.name), ids = [...new Set(loads.map((l) => l.wr))];
    const wrs = ids.map((id) => db.wrs.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
    const lbs = r2(loads.reduce((a, l) => { const w = db.wrs.find((x) => x.id === l.wr); const p = w?.pieces.find((x) => x.no === l.no); return a + (p ? chargeable(p) : 0); }, 0));
    return { sh, pieces: loads.length, lbs, wrs, billed: r2(wrs.reduce((a, w) => a + total(w), 0)), paid: r2(wrs.reduce((a, w) => a + paidAmt(w), 0)), owed: r2(wrs.reduce((a, w) => a + Math.max(0, balance(w)), 0)), noInvoice: wrs.filter((w) => !w.invoice).length };
  });
  const sum = (k: "billed" | "paid" | "owed") => r2(rows.reduce((a, r) => a + r[k], 0));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <div className="no-print"><h1>Shipments report</h1><p className="text-zinc-600">What each shipment billed to customers, what was paid and what is still owed. Compare it with the bills of that shipment in Payables.</p><div className="mt-2"><PrintButton label="Print the report" /></div></div>
      {rows.length === 0 ? <p className="mt-4 text-zinc-600">No shipment yet.</p> : (
        <table className="mt-4 w-full text-left">
          <thead className="border-b-2 border-black"><tr>{["Shipment", "Date", "Receipts", "Pieces", "Billed lb", "Billed", "Paid", "Owed", "Not invoiced"].map((h, i) => <th key={i} className={`${th} ${i >= 3 && i <= 7 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.sh.name} className="border-b border-zinc-200"><td className={`${td} whitespace-nowrap font-medium`}>{r.sh.name} <span className="text-xs text-zinc-500">{r.sh.ship}{r.sh.shipped ? "" : " · open"}</span></td><td className={td}>{r.sh.shipped ?? r.sh.date}</td><td className={td}>{r.wrs.length}</td><td className={`${td} text-right`}>{r.pieces}</td><td className={`${td} text-right`}>{r.lbs}</td><td className={`${td} text-right`}>{money(r.billed)}</td><td className={`${td} text-right`}>{money(r.paid)}</td><td className={`${td} text-right font-medium ${r.owed > 0 ? "text-red-700" : ""}`}>{money(r.owed)}</td><td className={td}>{r.noInvoice > 0 ? <Link href="/invoices/new" className="text-brand underline">{r.noInvoice}</Link> : "–"}</td></tr>))}
            <tr className="font-bold"><td className={td} colSpan={5}>Total</td><td className={`${td} text-right`}>{money(sum("billed"))}</td><td className={`${td} text-right`}>{money(sum("paid"))}</td><td className={`${td} text-right`}>{money(sum("owed"))}</td><td /></tr></tbody>
        </table>
      )}
    </main>
  );
}
