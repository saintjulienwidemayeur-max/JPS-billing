import Link from "next/link";
import { WhLink } from "@/components/wh-link";
import { invoiceRows, reportTotals } from "@/lib/invoice-report";
import { PrintButton } from "@/components/print-button";
import { db, total, paidAmt, balance, money, wrCode, repLabel } from "@/lib/wh-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Invoices · JP's Logistics" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1 font-semibold", td = "px-2 py-1";
const sel = "h-9 rounded-md border bg-white px-2 text-sm";
const PER = 100; // thousands of invoices build up: the page stays light (the totals below still cover every match)

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const rows = invoiceRows(q), tot = reportTotals(rows), qs = new URLSearchParams({ ...(q.ship && { ship: q.ship }), ...(q.shipment && { shipment: q.shipment }), ...(q.rep && { rep: q.rep }), ...(q.status && { status: q.status }), ...(q.customer && { customer: q.customer }) }).toString();
  const sum = (f: (w: (typeof rows)[number]) => number) => rows.reduce((a, w) => a + f(w), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  const shown = rows.slice((page - 1) * PER, page * PER);
  const shipOf = new Map<string, string>(); // first shipment each shown receipt is loaded on
  const want = new Set(shown.map((w) => w.id));
  for (const l of db.loads) if (want.has(l.wr) && !shipOf.has(l.wr)) shipOf.set(l.wr, l.shipment);
  const link = (p: number) => `/invoices?${new URLSearchParams({ ...(q.ship && { ship: q.ship }), ...(q.shipment && { shipment: q.shipment }), ...(q.rep && { rep: q.rep }), ...(q.status && { status: q.status }), ...(q.customer && { customer: q.customer }), page: String(p) })}`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1>Invoices</h1><div className="no-print flex flex-wrap items-center gap-3 text-sm"><a href={`/invoices/report?${qs}`} className="inline-flex h-9 items-center rounded-md border border-brand px-3 font-medium text-brand">Download PDF</a><a href={`/invoices/export?${qs}`} className="font-medium text-brand underline">Download CSV (Excel)</a><PrintButton /></div></div>
      <p className="text-sm text-zinc-600">Every invoice, with what was paid and what is still owed. Make a new one in <b>Invoice</b>; enter a payment with <b>Pay</b>.</p>
      <form method="get" className="no-print mt-4 flex flex-wrap gap-2">
        <select name="ship" defaultValue={q.ship ?? ""} className={sel} aria-label="Ship type"><option value="">All ship types</option><option value="Air">Air (JPF)</option><option value="Ocean">Ocean (JPL)</option></select>
        <select name="shipment" defaultValue={q.shipment ?? ""} className={sel} aria-label="Shipment"><option value="">All shipments</option>{[...db.shipments].reverse().map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
        <select name="rep" defaultValue={q.rep ?? ""} className={sel} aria-label="Representative"><option value="">All representatives</option>{db.reps.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.initials})</option>)}</select>
        <select name="status" defaultValue={q.status ?? ""} className={sel} aria-label="Status"><option value="">Paid and unpaid</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select>
        <Input name="customer" defaultValue={q.customer} placeholder="Customer name or number" className="w-56" aria-label="Customer" />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {rows.length === 0 ? <p className="mt-6 text-sm text-zinc-600">No invoices match.</p> : (
        <table className="mt-4 w-full text-left text-sm">
          <thead><tr>{["Invoice", "Shipment", "Receipt", "Bill To", "Rep", "Amount", "Paid", "Balance", "Emailed", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((w) => (
            <tr key={w.id} className="border-b border-zinc-100">
              <td className={`${td} whitespace-nowrap font-semibold`}>{w.invoice}</td>
              <td className={td}>{shipOf.get(w.id) ?? "–"}</td>
              <td className={`${td} whitespace-nowrap`}>{wrCode(w)}</td><td className={td}>{w.customer}</td><td className={td}>{repLabel(w.rep) || "–"}</td>
              <td className={td}>{money(total(w))}</td><td className={td}>{money(paidAmt(w))}</td>
              <td className={`${td} font-medium ${balance(w) > 0 ? "text-red-700" : "text-green-700"}`}>{money(balance(w))}</td>
              <td className={td}>{w.invoiceSent ? "Yes" : "No"}</td>
              <td className={`${td} space-x-3`}><Link href={`/invoices/${w.invoice}`} className="text-brand underline">Invoice</Link><Link href={`/payments?inv=${w.invoice}`} className="text-brand underline">Pay</Link></td>
            </tr>))}</tbody>
          <tfoot><tr className="font-semibold"><td className={td} colSpan={5}>{rows.length} invoice{rows.length > 1 ? "s" : ""}</td><td className={td}>{money(sum(total))}</td><td className={td}>{money(sum(paidAmt))}</td><td className={td}>{money(sum(balance))}</td><td colSpan={3} /></tr></tfoot>
        </table>
      )}
      {rows.length > 0 && (
        <section className="mt-6 rounded-lg border-2 border-black p-4" aria-label="Final totals">
          <h2 className="font-bold">Final totals <span className="text-sm font-normal text-zinc-500">· all {rows.length} invoice{rows.length > 1 ? "s" : ""} of this report</span></h2>
          <dl className="mt-2 grid max-w-md grid-cols-[1fr_auto] gap-x-8 gap-y-1">
            <dt>Total pieces</dt><dd className="text-right">{tot.pieces}</dd>
            <dt>Total weight</dt><dd className="text-right">{tot.lbs} lbs</dd>
            <dt>Total cubic feet</dt><dd className="text-right">{tot.cuft} cu ft</dd>
            <dt className="border-t pt-1 font-bold">Total amount</dt><dd className="border-t pt-1 text-right text-lg font-bold">{money(tot.amount)}</dd>
            <dt>Total paid</dt><dd className="text-right">{money(tot.paid)}</dd>
            <dt className="font-bold">Balance due</dt><dd className="text-right font-bold">{money(tot.balance)}</dd>
          </dl>
        </section>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="py-2 text-brand underline">Previous</Link> : <span className="py-2 text-zinc-400">Previous</span>}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="py-2 text-brand underline">Next</Link> : <span className="py-2 text-zinc-400">Next</span>}
        </div>
      )}
    </main>
  );
}
