import Link from "next/link";
import { db, charges, total, money, wrCode, repLabel , priced } from "@/lib/wh-store";
import { createInvoice, createInvoices } from "@/lib/billing-actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Invoice · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const needle = (q.q ?? q.c ?? "").trim().toLowerCase();
  const onShip = q.ship ? new Set(db.loads.filter((l) => l.shipment === q.ship).map((l) => l.wr)) : undefined, digits = needle.replace(/\D/g, "");
  const todo = db.wrs.filter((w) => !w.invoice && !w.estimate && (w.pieces.length > 0 || charges(w) > 0) && priced(w) && (!onShip || onShip.has(w.id)) && (!needle || String(w.cust) === needle || w.customer.toLowerCase().includes(needle) || w.id === needle || (digits.length >= 4 && (db.customers.find((c) => c.no === w.cust)?.phone ?? "").replace(/\D/g, "").includes(digits)))).sort((a, b) => Number(a.id) - Number(b.id));
  const shown = todo.slice(0, 100);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1>Invoice</h1>
      <p className="text-sm text-zinc-600">Make the invoice of a warehouse receipt. The receipt (pieces, fees, insurance) is prepared in the warehouse app; here it becomes an invoice with its number. Only receipts with pieces or fees are listed (an estimate is not invoiced until it is final).</p>
      {q.err && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{q.err}</p>}
      {q.ok && <p role="status" className="mt-2 text-sm font-medium text-green-700">{q.ok}</p>}
      <form className="mt-4 flex flex-wrap gap-2"><Input name="q" defaultValue={q.q ?? q.c} placeholder="Customer name, number or phone, or receipt number" className="max-w-80" /><select name="ship" defaultValue={q.ship ?? ""} className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Shipment"><option value="">All shipments</option>{[...db.shipments].reverse().map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select><Button type="submit" variant="outline">Find</Button></form>
      <p className="mt-3 text-sm text-zinc-600">{todo.length} receipt{todo.length === 1 ? "" : "s"} waiting for an invoice{todo.length > shown.length ? ` (the first ${shown.length} are shown)` : ""}.</p>
      {shown.length > 1 && <form action={createInvoices} className="mt-2"><input type="hidden" name="ids" value={shown.map((w) => w.id).join(",")} /><ConfirmSubmit message={`Make ${shown.length} invoices now? Each customer with an e-mail gets the invoice by e-mail.`}>Make all {shown.length} invoices{q.ship ? ` of ${q.ship}` : ""}</ConfirmSubmit></form>}
      {shown.length > 0 && (
        <table className="mt-2 w-full text-left text-sm"><thead><tr>{["Date", "Receipt", "Customer", "Rep", "Total", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((w) => (
            <tr key={w.id} className="border-b border-zinc-100"><td className={td}>{w.date}</td><td className={`${td} whitespace-nowrap`}>{wrCode(w)}</td><td className={td}><Link href={`/customers/${w.cust}`} className="hover:text-brand">{w.customer}</Link></td><td className={td}>{repLabel(w.rep) || "–"}</td><td className={td}>{money(total(w))}</td>
              <td className={td}><form action={createInvoice}><input type="hidden" name="wr" value={w.id} /><button className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white">Make invoice</button></form></td></tr>))}</tbody></table>
      )}
    </main>
  );
}
