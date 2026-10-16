import Link from "next/link";
import { db, money, balance, wrCode } from "@/lib/wh-store";
import { daysSince } from "@/lib/clock";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Storage report · JP's Billing" };
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";
const LIMIT = 30; // the terms on every receipt: after 30 days in the warehouse a storage fee is applied

export default async function Page() {
  const loaded = new Set(db.loads.map((l) => l.no));
  const here = new Map<string, string>(); // receipt -> the date its last piece arrived at the destination
  for (const l of db.loads) if (l.here) here.set(l.wr, l.here);
  const rows = db.wrs.flatMap((w) => {
    if (!w.pieces.length) return [];
    const waiting = w.pieces.filter((p) => !loaded.has(p.no)).length;
    if (waiting > 0) { const d = daysSince(w.date); return d > LIMIT ? [{ w, where: "Miami: not shipped", since: w.date, days: d, n: waiting }] : []; }
    const allHere = w.pieces.every((p) => db.loads.some((l) => l.no === p.no && l.here));
    if (allHere && balance(w) > 0 && w.invoice) { const at = here.get(w.id) ?? w.date; const d = daysSince(at); return d > LIMIT ? [{ w, where: "Haiti: here and unpaid", since: at, days: d, n: w.pieces.length }] : []; }
    return [];
  }).sort((a, b) => b.days - a.days);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <div className="no-print"><h1>Storage ({LIMIT}+ days)</h1><p className="text-zinc-600">The terms on every receipt say a storage fee applies after {LIMIT} days in the warehouse. This lists receipts with pieces still in Miami after {LIMIT} days, and receipts that arrived in Haiti more than {LIMIT} days ago and are still unpaid. Add the storage fee on the receipt (warehouse app) when it applies.</p><div className="mt-2"><PrintButton label="Print the report" /></div></div>
      {rows.length === 0 ? <p className="mt-4 text-zinc-600">Nothing has waited more than {LIMIT} days.</p> : (
        <table className="mt-4 w-full text-left"><thead className="border-b-2 border-black"><tr>{["Receipt", "Customer", "Where", "Since", "Days", "Pieces", "Balance"].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.w.id} className="border-b border-zinc-200"><td className={`${td} whitespace-nowrap font-medium`}>{wrCode(r.w)}</td><td className={td}><Link href={`/customers/${r.w.cust}`} className="hover:text-brand">{r.w.customer}</Link></td><td className={td}>{r.where}</td><td className={td}>{r.since}</td><td className={`${td} font-semibold text-red-700`}>{r.days}</td><td className={td}>{r.n}</td><td className={td}>{money(balance(r.w))}</td></tr>)}</tbody></table>
      )}
    </main>
  );
}
