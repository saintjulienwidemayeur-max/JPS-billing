import Link from "next/link";
import { db, balance, money, r2, creditOf, debtBalance } from "@/lib/wh-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "View customer · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const PER = 12;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const needle = (q.q ?? "").trim().toLowerCase();
  const owed = new Map<number, number>();
  for (const w of db.wrs) if (w.invoice) owed.set(w.cust, r2((owed.get(w.cust) ?? 0) + Math.max(0, balance(w))));
  for (const d of db.debts) owed.set(d.cust, r2((owed.get(d.cust) ?? 0) + Math.max(0, debtBalance(d))));
  const all = db.customers.filter((c) => (!needle || String(c.no) === needle || [c.name, c.phone, c.email, c.box ?? ""].some((v) => v.toLowerCase().includes(needle))) && (q.show !== "owing" || (owed.get(c.no) ?? 0) > 0));
  const pages = Math.max(1, Math.ceil(all.length / PER)), page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  const rows = all.slice((page - 1) * PER, page * PER);
  const link = (p: number) => `/customers?${new URLSearchParams({ ...(q.q && { q: q.q }), ...(q.show && { show: q.show }), page: String(p) })}`;
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1>View customer</h1>
      <p className="text-sm text-zinc-600">Find a customer to see what they owe, their invoices and payments, and to print their statement. Customers are added and edited in the warehouse app.</p>
      <form className="mt-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q.q} placeholder="Number, name, phone, e-mail or box" className="max-w-80" autoFocus />
        <select name="show" defaultValue={q.show ?? ""} className="h-9 rounded-md border bg-white px-2 text-sm"><option value="">All customers</option><option value="owing">Only who owes</option></select>
        <Button type="submit" variant="outline">Search</Button>
        <span className="text-sm text-zinc-600">{all.length.toLocaleString("en-US")} customers</span>
      </form>
      <table className="mt-3 w-full table-fixed text-left text-sm">
        <colgroup><col className="w-16" /><col /><col className="w-40" /><col className="w-28" /><col className="w-28" /><col className="w-20" /></colgroup>
        <thead><tr>{["No.", "Name", "Phone", "Owes", "Credit", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.no} className="border-b border-zinc-100">
            <td className={`${td} font-semibold`}>{c.no}</td>
            <td className={`${td} truncate`} title={c.name}><Link href={`/customers/${c.no}`} className="hover:text-brand">{c.name}</Link></td>
            <td className={`${td} truncate`}>{c.phone || "–"}</td>
            <td className={`${td} font-medium ${(owed.get(c.no) ?? 0) > 0 ? "text-red-700" : ""}`}>{money(owed.get(c.no) ?? 0)}</td>
            <td className={td}>{money(creditOf(c))}</td>
            <td className={td}><Link href={`/customers/${c.no}`} className="text-brand underline">Open</Link></td>
          </tr>))}</tbody>
      </table>
      {rows.length === 0 && <p className="mt-3 text-sm text-zinc-600">No customer matches.</p>}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="text-brand underline">Previous</Link> : <span className="text-zinc-400">Previous</span>}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="text-brand underline">Next</Link> : <span className="text-zinc-400">Next</span>}
        </div>
      )}
    </main>
  );
}
