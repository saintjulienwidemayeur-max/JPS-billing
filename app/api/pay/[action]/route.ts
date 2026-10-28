// The API behind the pay page of the website (jpslogistics.me/pay.html): the page never talks to Stripe or to the database itself, the website's
// Supabase function `pay-proxy` forwards its three calls here: info (what is owed), checkout (open Stripe), confirm (record the payment).
// The signed token in every call is the key.
import { ensureLoaded, refresh } from "@/lib/persist";
import { total, paidAmt, balance, money, wrCode, custOf } from "@/lib/wh-store";
import { wrOfToken, docUrl, receiptUrl, payToken, siteBase } from "@/lib/paylink";
import { stripeReady, stripeStatus, publishableKey } from "@/lib/stripe";
import { openCheckout } from "@/lib/pay-checkout";
import { settleSession } from "@/lib/online-pay";

export const dynamic = "force-dynamic";
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const body = (await req.json().catch(() => ({}))) as { t?: string; session_id?: string; embedded?: boolean };
  await ensureLoaded(); await refresh();
  const w = body.t ? wrOfToken(String(body.t)) : undefined;
  if (!w) return json({ error: "link" }, 404);
  const site = siteBase(), tok = payToken(w);
  if (action === "info") {
    const c = custOf(w), bal = Math.max(0, balance(w)), paid = paidAmt(w);
    return json({
      name: w.customer, lang: c?.lang ?? "fr", wr: wrCode(w), invoice: w.invoice ?? null, total: total(w), paid, balance: bal, status: paid <= 0 ? "unpaid" : bal <= 0.004 ? "paid" : "partial",
      canPay: stripeReady() && bal > 0.004, stripe: stripeStatus(), publishableKey: publishableKey(), wrPdf: docUrl(w, "wr"), invoicePdf: w.invoice ? docUrl(w, "invoice") : "",
      payments: w.payments.map((p, i) => ({ date: p.date, method: p.method, amount: p.amount, receipt: receiptUrl(w, i) })), money: money(bal),
    });
  }
  if (action === "checkout") {
    if (!site) return json({ error: "off" }, 503);
    const embedded = !!publishableKey(); // the payment form opens inside the website page when the publishable key is set
    const r = await openCheckout(w, { success: `${site}/pay.html?t=${tok}&session_id={CHECKOUT_SESSION_ID}`, cancel: `${site}/pay.html?t=${tok}&canceled=1` }, embedded);
    return "error" in r ? json({ error: r.error }, 400) : "clientSecret" in r ? json({ clientSecret: r.clientSecret, publishableKey: publishableKey() }) : json({ url: r.url });
  }
  if (action === "confirm") {
    const id = String(body.session_id ?? "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "session" }, 400);
    const r = await settleSession(id, "Website pay page");
    if (r.ok && r.wr === w.id) return json({ ok: true, amount: r.amount, index: r.index, receipt: r.index >= 0 ? receiptUrl(w, r.index) : "" });
    return json({ ok: false, pending: !r.ok && !!r.pending }, r.ok ? 400 : 200);
  }
  return json({ error: "action" }, 404);
}
