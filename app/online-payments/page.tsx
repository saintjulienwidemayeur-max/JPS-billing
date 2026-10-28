import Link from "next/link";
import { db, custOf, money, wrCode, r2 } from "@/lib/wh-store";
import { usToIso } from "@/lib/clock";
import { stripeReady } from "@/lib/stripe";
import { payBase, payToken } from "@/lib/paylink";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Online payments · JP's Billing" };
const th = "px-2 py-1 font-semibold", td = "px-2 py-1 align-top";

// Every payment the customers made online (Stripe): newest first, with who paid, the invoice, how, and the receipt.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, needle = (q.q ?? "").toLowerCase(), month = q.month ?? "";
  const all = db.wrs.flatMap((w) => w.payments.map((p, i) => ({ w, p, i }))).filter((x) => x.p.online);
  const rows = all.filter(({ w, p }) => (!month || usToIso(p.date).startsWith(month)) && (!needle || `${w.customer} ${w.cust} ${w.invoice} ${p.payer ?? ""} ${p.payerEmail ?? ""} ${p.method} ${p.ref}`.toLowerCase().includes(needle)))
    .sort((a, b) => `${usToIso(b.p.date)} ${b.p.time ?? ""}`.localeCompare(`${usToIso(a.p.date)} ${a.p.time ?? ""}`));
  const problem = db.audit.find((x) => x.action === "checkout failed");
  const sum = r2(rows.reduce((a, x) => a + x.p.amount, 0));
  const months = [...new Set(all.map((x) => usToIso(x.p.date).slice(0, 7)))].sort().reverse();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1>Online payments</h1>
      <p className="text-sm text-zinc-600">Payments the customers made by themselves from the link in the invoice e-mail, the WhatsApp message or their space on the website (Stripe: cards, Apple Pay, Google Pay, Link...). Each one is already recorded on its invoice, and the customer got the receipt.</p>
      {!stripeReady() && <p role="alert" className="mt-2 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-900">Online payment is not turned on: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Render (this app), and PAY_BASE_URL if the address below is empty. Public address used in the links: <b>{payBase() || "(not known yet)"}</b></p>}
      {problem && <p role="alert" className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-800"><b>Last problem opening Stripe</b> ({problem.date} {problem.time}, {problem.detail}): {problem.result}</p>}
      <form className="mt-4 flex flex-wrap items-center gap-2">
        <Input name="q" placeholder="Search customer, invoice, payer, reference" defaultValue={q.q} className="max-w-72" aria-label="Search" />
        <select name="month" defaultValue={month} aria-label="Month" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="">All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <Button type="submit" variant="outline">Filter</Button>
        <Link href="/online-payments" className="text-sm text-brand underline">Clear</Link>
      </form>
      <p className="mb-2 mt-3 text-sm text-zinc-700"><b>{rows.length}</b> payment{rows.length === 1 ? "" : "s"} · total <b>{money(sum)}</b></p>
      {rows.length === 0 ? <p className="text-sm text-zinc-600">No online payment yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr>{["Date", "Customer", "Paid by", "Invoice", "Receipt", "Method", "Amount", "Stripe reference", ""].map((h, i) => <th key={i} className={`${th} ${h === "Amount" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(({ w, p, i }) => (
            <tr key={`${w.id}-${i}`} className="border-b border-zinc-100">
              <td className={`${td} whitespace-nowrap`}>{p.date}{p.time && <span className="block text-xs text-zinc-500">{p.time}</span>}</td>
              <td className={td}><Link href={`/customers/${w.cust}`} className="text-brand underline">{custOf(w)?.name ?? w.customer}</Link><span className="block text-xs text-zinc-500">#{w.cust}</span></td>
              <td className={td}>{p.payer || "–"}{p.payerEmail && <span className="block text-xs text-zinc-500">{p.payerEmail}</span>}</td>
              <td className={td}>{w.invoice ? <Link href={`/invoices/${encodeURIComponent(w.invoice)}`} className="text-brand underline">{w.invoice}</Link> : "–"}</td>
              <td className={td}>{wrCode(w)}</td><td className={td}>{p.method}</td>
              <td className={`${td} text-right font-semibold`}>{money(p.amount)}</td>
              <td className={`${td} font-mono text-xs`}>{p.ref.startsWith("stripe:pi_") ? <a href={`https://dashboard.stripe.com/payments/${p.ref.slice(7)}`} target="_blank" rel="noreferrer" className="text-brand underline">{p.ref.slice(7)}</a> : p.ref}</td>
              <td className={td}><a href={`/pay/${payToken(w.id)}/receipt/${i}`} target="_blank" className="text-brand underline">Receipt PDF</a></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </main>
  );
}
