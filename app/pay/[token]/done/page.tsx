import Link from "next/link";
import { notFound } from "next/navigation";
import { db, custOf, money } from "@/lib/wh-store";
import { readPayToken } from "@/lib/paylink";
import { settleSession } from "@/lib/online-pay";
import { PT, langOf } from "@/lib/pay-text";

export const metadata = { title: "Payment · JP's Logistics & More", robots: { index: false, follow: false } };

// Where Stripe sends the customer after paying: the payment is checked with Stripe and recorded right here (the webhook does the same if the customer never gets back).
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params, q = await searchParams;
  const inv = readPayToken(token);
  if (!inv || !q.session_id || !/^cs_[A-Za-z0-9_]+$/.test(q.session_id)) notFound();
  const r = await settleSession(q.session_id, "Pay page");
  const w = db.wrs.find((x) => x.invoice === inv), t = PT[langOf(q.lang, w ? custOf(w)?.lang : undefined)];
  const ok = r.ok && r.invoice === inv;
  return (
    <main className="mx-auto max-w-md px-4 py-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="JP's Logistics & More" className="mx-auto h-16 w-auto" />
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        {ok ? <>
          <h1 className="!text-xl text-green-700">{t.done}</h1>
          <p className="mt-3 text-sm text-zinc-700">{t.doneText.replace("{x}", money(r.amount)).replace("{i}", inv)}</p>
          {r.index >= 0 && <a href={`/pay/${token}/receipt/${r.index}`} target="_blank" className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white" style={{ background: "#20338f" }}>{t.dl}</a>}
        </> : !r.ok && r.pending ? <p className="text-sm text-zinc-700">{t.pending}</p> : <p role="alert" className="text-sm font-medium text-amber-900">{t.unknown}</p>}
        <p className="mt-5"><Link href={`/pay/${token}`} className="text-sm text-brand underline">{t.back}</Link></p>
      </section>
    </main>
  );
}
