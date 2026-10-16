import { notFound } from "next/navigation";
import { cancelInvoice, voidPayment } from "@/lib/billing-actions";
import { listDocs } from "@/lib/persist";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { db, custOf, repOf, wrCode, total, paidAmt, balance, payStatus, money, insuranceFee, quote, r2, freightFee, freightQty, freightDesc } from "@/lib/wh-store";
import { cardFees } from "@/lib/pricing";
import { shortDate } from "@/lib/fmt";
import { PrintButton } from "@/components/print-button";

const th = "px-2 py-1 font-semibold", td = "px-2 py-1";

export default async function Page({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const no = decodeURIComponent((await params).no);
  const w = db.wrs.find((x) => x.invoice === no);
  if (!w) notFound();
  const c = custOf(w), lbs = r2(w.pieces.reduce((a, p) => a + p.lbs, 0));
  const shipment = db.loads.find((l) => l.wr === w.id)?.shipment ?? "";
  // Freight lines say which receipt, weight and pieces they are for, like the old invoice.
  const ref = ` - Ref. WR: ${w.id} - (${lbs} lbs) - Number Of Pieces: ${w.pieces.length}`;
  type Line = { desc: string; amount: number; qty?: number; rate?: number };
  const lines: Line[] = [
    // The freight line is automatic: Air = chargeable lbs x rate, Ocean = cubic feet x rate.
    ...(freightFee(w) > 0 ? [{ desc: freightDesc(w), amount: freightFee(w), qty: freightQty(w), rate: w.rate }] : []),
    ...w.fees.map((f) => ({ desc: f.label + (/freight/i.test(f.label) ? ref : ""), amount: f.kind === "credit" ? -f.amount : f.amount })),
    ...(insuranceFee(w) > 0 ? [{ desc: `Certificate of insurance - Ref. WR: ${w.id} - declared value ${money(w.declared)}`, amount: quote(w).customer }] : []),
  ];
  const card = cardFees(balance(w));
  const docs = await listDocs("invoice", w.invoice ?? "");
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 text-sm">
      <div className="flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="JP's Logistics & More" className="h-16 w-auto" />
        <div className="text-right"><h1 className="!text-2xl">Invoice {w.invoice}</h1><div className="no-print mt-2"><PrintButton /></div></div>
      </div>
      {q.err && <p role="alert" className="no-print mt-2 font-medium text-red-700">{q.err}</p>}
      {q.ok && <p className="no-print mt-2 font-medium text-green-700">{q.ok}</p>}
      <div className="no-print mt-3 flex flex-wrap items-center gap-2">
        <a href={`/invoices/${encodeURIComponent(w.invoice ?? "")}/pdf`} target="_blank" className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 font-medium">Download PDF</a>
        <a href={`/payments?inv=${w.invoice}`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 font-medium">Enter payment</a>
        <form className="ml-auto"><button formAction={cancelInvoice.bind(null, w.id)} className="text-red-700 underline">Cancel invoice</button></form>
      </div>
      <p className={`no-print mt-2 text-xs ${w.invoiceSent ? "text-green-700" : w.invoiceMail?.error ? "text-amber-800" : "text-zinc-500"}`}>
        {w.invoiceSent ? `E-mailed to the customer by itself on ${w.invoiceSent} (PDF attached).` : w.invoiceMail?.error ? `Not e-mailed: ${w.invoiceMail.error}${w.invoiceMail.tries < 4 ? " It will be tried again by itself." : ""}` : "The invoice is e-mailed to the customer by itself a few seconds after it is made."}
      </p>
      {docs.length > 0 && <ul className="no-print mt-1 grid gap-0.5 text-xs">{docs.map((d) => <li key={d.id}><a href={`/docs/${d.id}`} target="_blank" className="text-brand underline">{d.name}</a> <span className="text-zinc-500">· {d.note} · {new Date(d.created).toLocaleString("en-US")}</span></li>)}</ul>}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        <div><dt className="text-xs text-zinc-500">Invoice date</dt><dd className="font-medium">{shortDate(w.invoiceDate ?? w.date)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Shipment ID</dt><dd className="font-medium">{shipment || "–"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Receipt</dt><dd className="font-medium">{wrCode(w)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Type</dt><dd>{w.ship}</dd></div>
        <div><dt className="text-xs text-zinc-500">Status</dt><dd>{payStatus(w)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Representative</dt><dd>{repOf(w.rep)?.initials ?? "–"}</dd></div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div><div className="text-xs text-zinc-500">Bill To</div><b>{w.customer}</b><div>{c?.billing}</div>{w.email && <div>{w.email}</div>}</div>
        <div><div className="text-xs text-zinc-500">Consignee</div><b>{c?.consignee || w.customer}</b><div>{[c?.consigneeCity, c?.consigneeCountry].filter(Boolean).join(", ")}</div></div>
      </div>
      {w.comments && <p className="mt-3"><b>Notes:</b> {w.comments}</p>}

      <table className="mt-4 w-full text-left">
        <thead className="border-b-2 border-black"><tr><th className={th}>Description</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th></tr></thead>
        <tbody>{lines.length === 0 ? <tr><td className={`${td} text-zinc-500`} colSpan={4}>No fees on this receipt yet.</td></tr> : lines.map((l, i) => (
          <tr key={i} className="border-b border-zinc-300"><td className={td}>{l.desc}</td><td className={`${td} text-right`}>{l.qty ?? "1.00"}</td><td className={`${td} text-right`}>{l.rate !== undefined ? money(l.rate) : `${l.amount < 0 ? "−" : ""}${money(Math.abs(l.amount))}`}</td><td className={`${td} text-right`}>{l.amount < 0 ? "−" : ""}{money(Math.abs(l.amount))}</td></tr>))}</tbody>
      </table>
      <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t-2 border-black pt-2">
        <dt className="font-bold">Total</dt><dd className="text-right font-bold">{money(total(w))}</dd>
        <dt>Paid</dt><dd className="text-right">{money(paidAmt(w))}</dd>
        <dt>Balance</dt><dd className="text-right">{money(balance(w))}</dd>
      </dl>
      {w.payments.length > 0 && (
        <div className="mt-4 text-xs"><div className="font-semibold">Payments received</div>
          {w.payments.map((p, i) => <div key={i} className="flex items-center justify-between gap-3 border-b border-zinc-200 py-0.5"><span>{p.date} · {p.method}{p.ref && ` · ${p.ref}`}</span><span className="flex items-center gap-3">{money(p.amount)}<form action={voidPayment.bind(null, w.id, i)} className="no-print"><ConfirmSubmit message={`Void this payment of ${money(p.amount)}?`} className="!h-6 !bg-white !px-2 !text-xs !text-red-700 underline">Void</ConfirmSubmit></form></span></div>)}
        </div>
      )}
      {balance(w) > 0 && (
        <div className="mt-4 max-w-sm border border-zinc-400 p-2 text-xs">
          <div className="font-semibold">If paying the balance ({money(balance(w))}) by credit card</div>
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-4">
            {([["Square CC invoice", card.invoice], ["Pay by credit card, card present", card.present], ["Pay by credit card, manual", card.manual]] as const).map(([label, v]) => (
              <div key={label} className="contents"><span>{label}</span><span className="text-right">{money(v.fee)}</span><b className="text-right">{money(v.total)}</b></div>))}
          </div>
        </div>
      )}
    </main>
  );
}
