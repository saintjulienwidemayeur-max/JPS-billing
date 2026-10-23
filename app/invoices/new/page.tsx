import Link from "next/link";
import { db, total, money, wrCode, repLabel, hasCharges } from "@/lib/wh-store";
import { createInvoice } from "@/lib/billing-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Invoice · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const needle = (q.q ?? q.c ?? "").trim().toLowerCase();
  const todo = db.wrs.filter((w) => !w.invoice && w.pieces.length > 0 && hasCharges(w) && (!needle || String(w.cust) === needle || w.customer.toLowerCase().includes(needle) || w.id === needle));
  const shown = todo.slice(0, 100);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1>Invoice</h1>
      <p className="text-sm text-zinc-600">Make the invoice of a warehouse receipt. The receipt (pieces, fees, insurance) is prepared in the warehouse app; here it becomes an invoice with its number. Only receipts with pieces and fees are listed.</p>
      {q.err && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{q.err}</p>}
      <form className="mt-4 flex gap-2"><Input name="q" defaultValue={q.q ?? q.c} placeholder="Customer name or number, or receipt number" className="max-w-80" /><Button type="submit" variant="outline">Find</Button></form>
      <p className="mt-3 text-sm text-zinc-600">{todo.length} receipt{todo.length === 1 ? "" : "s"} waiting for an invoice{todo.length > shown.length ? ` (the first ${shown.length} are shown)` : ""}.</p>
      {shown.length > 0 && (
        <table className="mt-2 w-full text-left text-sm"><thead><tr>{["Date", "Receipt", "Customer", "Rep", "Total", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((w) => (
            <tr key={w.id} className="border-b border-zinc-100"><td className={td}>{w.date}</td><td className={`${td} whitespace-nowrap`}>{wrCode(w)}</td><td className={td}><Link href={`/customers/${w.cust}`} className="hover:text-brand">{w.customer}</Link></td><td className={td}>{repLabel(w.rep) || "–"}</td><td className={td}>{money(total(w))}</td>
              <td className={td}><form action={createInvoice}><input type="hidden" name="wr" value={w.id} /><button className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white">Make invoice</button></form></td></tr>))}</tbody></table>
      )}
    </main>
  );
}
