import Link from "next/link";
import { money, r2 } from "@/lib/wh-store";
import { isoToday, usToIso } from "@/lib/clock";
import { allPayments, locations, sumBy } from "@/lib/paylist";
import { PrintButton } from "@/components/print-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Payment log report · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const month = q.month || isoToday().slice(0, 7), loc = q.loc ?? "";
  const list = allPayments().filter((x) => usToIso(x.p.date).startsWith(month) && (!loc || x.loc === loc));
  const total = r2(list.reduce((a, x) => a + x.p.amount, 0));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm">
      <div className="no-print">
        <h1>Payment log report</h1>
        <p className="text-zinc-600">The payments of a month, by location (the destination of the receipt it was paid on).</p>
        <form className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-600">Month <Input name="month" type="month" defaultValue={month} className="w-44" /></label>
          <label className="text-xs text-zinc-600">Location <select name="loc" defaultValue={loc} className="block h-9 rounded-md border bg-white px-2 text-sm"><option value="">All locations</option>{locations().map((l) => <option key={l}>{l}</option>)}</select></label>
          <Button type="submit" variant="outline" className="self-end">Show</Button><a href={`/reports/payment-log/export?month=${month}&loc=${encodeURIComponent(loc)}`} className="self-end pb-2 text-sm font-medium text-brand underline">Download CSV</a><span className="self-end"><PrintButton label="Print the report" /></span>
        </form>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="JP's Logistics & More" className="h-14 w-auto" />
        <div className="text-right"><div className="text-xl font-bold">Payment log report</div><div>{month}{loc ? ` · ${loc}` : " · all locations"}</div></div>
      </div>
      {list.length === 0 ? <p className="mt-4 text-zinc-600">No payment that month.</p> : (
        <>
          <table className="mt-4 w-full text-left"><thead className="border-b-2 border-black"><tr>{["Date", "Customer", "For", "Location", "Method", "Reference", "Amount"].map((h, i) => <th key={i} className={`${th} ${i === 6 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{list.map((x, k) => <tr key={k} className="border-b border-zinc-200"><td className={td}>{x.p.date}</td><td className={td}><Link href={`/customers/${x.cust}`} className="hover:text-brand">{x.customer}</Link></td><td className={`${td} whitespace-nowrap`}>{x.label}</td><td className={td}>{x.loc}</td><td className={td}>{x.p.method}</td><td className={td}>{x.p.ref || "–"}</td><td className={`${td} text-right`}>{money(x.p.amount)}</td></tr>)}
              <tr className="font-bold"><td className={td} colSpan={6}>Total ({list.length} payments)</td><td className={`${td} text-right`}>{money(total)}</td></tr></tbody></table>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <table className="w-full text-left"><thead className="border-b border-black"><tr><th className={th}>By method</th><th className={`${th} text-right`}>Amount</th></tr></thead><tbody>{sumBy(list, (x) => x.p.method).map(([k, v]) => <tr key={k} className="border-b border-zinc-200"><td className={td}>{k}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}</tbody></table>
            <table className="w-full text-left"><thead className="border-b border-black"><tr><th className={th}>By location</th><th className={`${th} text-right`}>Amount</th></tr></thead><tbody>{sumBy(list, (x) => x.loc).map(([k, v]) => <tr key={k} className="border-b border-zinc-200"><td className={td}>{k}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </main>
  );
}
