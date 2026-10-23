import Link from "next/link";
import { money, r2 } from "@/lib/wh-store";
import { isoToday, isoToUs, usToIso } from "@/lib/clock";
import { allPayments, sumBy } from "@/lib/paylist";
import { PrintButton } from "@/components/print-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Daily payment report · JP's Billing" };
type SP = Promise<Record<string, string | undefined>>;
const th = "px-2 py-1.5 font-semibold", td = "px-2 py-1.5";

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const day = q.day || isoToday();
  const list = allPayments().filter((x) => usToIso(x.p.date) === day);
  const total = r2(list.reduce((a, x) => a + x.p.amount, 0));
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-sm">
      <div className="no-print">
        <h1>Daily payment report</h1>
        <form className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-zinc-600">Day <Input name="day" type="date" defaultValue={day} className="w-44" /></label><Button type="submit" variant="outline">Show</Button><a href={`/reports/daily/export?day=${day}`} className="text-sm font-medium text-brand underline">Download CSV</a><PrintButton label="Print the report" /></form>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="JP's Logistics & More" className="h-14 w-auto" />
        <div className="text-right"><div className="text-xl font-bold">Daily payment report</div><div>{isoToUs(day)}</div></div>
      </div>
      {list.length === 0 ? <p className="mt-4 text-zinc-600">No payment received that day.</p> : (
        <>
          <table className="mt-4 w-full text-left"><thead className="border-b-2 border-black"><tr>{["Time", "Customer", "For", "Method", "Reference", "Amount"].map((h, i) => <th key={i} className={`${th} ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{list.map((x, k) => <tr key={k} className="border-b border-zinc-200"><td className={td}>{x.p.time ?? ""}</td><td className={td}><Link href={`/customers/${x.cust}`} className="hover:text-brand">{x.customer}</Link></td><td className={td}>{x.label}</td><td className={td}>{x.p.method}</td><td className={td}>{x.p.ref || "–"}</td><td className={`${td} text-right`}>{money(x.p.amount)}</td></tr>)}
              <tr className="font-bold"><td className={td} colSpan={5}>Total ({list.length} payment{list.length === 1 ? "" : "s"})</td><td className={`${td} text-right`}>{money(total)}</td></tr></tbody></table>
          <table className="mt-5 w-full max-w-sm text-left"><thead className="border-b border-black"><tr><th className={th}>By method</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody>{sumBy(list, (x) => x.p.method).map(([k, v]) => <tr key={k} className="border-b border-zinc-200"><td className={td}>{k}</td><td className={`${td} text-right`}>{money(v)}</td></tr>)}</tbody></table>
        </>
      )}
    </main>
  );
}
