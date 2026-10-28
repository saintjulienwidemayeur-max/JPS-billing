import Link from "next/link";
import { notFound } from "next/navigation";
import { db, custOf, total, paidAmt, balance, money, wrCode } from "@/lib/wh-store";
import { wrOfToken } from "@/lib/paylink";
import { stripeReady } from "@/lib/stripe";
import { startCheckout } from "../actions";
import { PT, langOf } from "@/lib/pay-text";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pay your invoice · JP's Logistics & More", robots: { index: false, follow: false } };

// The page the customer reaches from the link in the e-mail, the WhatsApp message or the website: no sign-in, the link is the key.
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params, q = await searchParams;
  const w = wrOfToken(token);
  if (!w) notFound();
  const c = custOf(w), lang = langOf(q.lang, c?.lang), t = PT[lang];
  const bal = Math.max(0, balance(w)), paid = paidAmt(w);
  const status = paid <= 0 ? t.st_unpaid : bal <= 0.004 ? t.st_paid : t.st_partial;
  const err = q.err ? t[`e_${q.err}`] : q.canceled ? t.canceled : "";
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="JP's Logistics & More" className="mx-auto h-16 w-auto" />
      <div className="mt-2 flex justify-center gap-3 text-xs">{(["fr", "en", "es"] as const).map((l) => <Link key={l} href={`/pay/${token}?lang=${l}`} className={l === lang ? "font-bold text-brand" : "text-zinc-500 underline"}>{l.toUpperCase()}</Link>)}</div>
      <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="!text-xl">{w.invoice ? `${t.invoice} ${w.invoice}` : `${t.receipt} ${wrCode(w)}`}</h1>
        <p className="mt-1 text-sm text-zinc-600">{w.customer}{w.invoice ? ` · ${t.receipt} ${wrCode(w)}` : ""}</p>
        <p className="mt-2 flex flex-wrap gap-4 text-xs"><a href={`/pay/${token}/wr`} target="_blank" className="text-brand underline">{t.wrPdf}</a>{w.invoice && <a href={`/pay/${token}/invoice`} target="_blank" className="text-brand underline">{t.invPdf}</a>}</p>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt>{t.total}</dt><dd className="text-right">{money(total(w))}</dd>
          <dt>{t.paid}</dt><dd className="text-right">{money(paid)}</dd>
          <dt className="font-bold">{t.balance}</dt><dd className="text-right text-lg font-bold">{money(bal)}</dd>
          <dt>{t.status}</dt><dd className="text-right">{status}</dd>
        </dl>
        {!w.invoice && bal > 0.004 && <p className="mt-3 text-xs text-zinc-500">{t.estimate}</p>}
        {err && <p role="alert" className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-900">{err}</p>}
        {bal > 0.004 ? (
          stripeReady() ? (
            <form action={startCheckout.bind(null, token)} className="mt-5">
              <Button type="submit" className="h-12 w-full text-base font-semibold">{t.pay.replace("{x}", money(bal))}</Button>
              <p className="mt-2 text-center text-xs text-zinc-500">{t.secure}</p>
            </form>
          ) : <p className="mt-5 text-sm text-zinc-600">{t.e_off}</p>
        ) : <p className="mt-5 rounded-md bg-green-50 p-3 text-center text-sm font-semibold text-green-800">{t.paidFull}</p>}
      </section>
      {w.payments.length > 0 && (
        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-bold">{t.payments}</h2>
          <ul className="mt-2 grid gap-1">{w.payments.map((p, i) => <li key={i} className="flex items-center justify-between gap-3 border-b border-zinc-100 py-1"><span>{p.date} · {p.method}</span><span className="whitespace-nowrap">{money(p.amount)} · <a href={`/pay/${token}/receipt/${i}`} target="_blank" className="text-brand underline">{t.receiptPdf}</a></span></li>)}</ul>
        </section>
      )}
      <p className="mt-6 text-center text-xs text-zinc-400">JP&apos;s Logistics &amp; More · Miami, FL · +1 (786) 424-8025</p>
    </main>
  );
}
