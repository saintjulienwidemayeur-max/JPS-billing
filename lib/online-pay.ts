// An online payment (Stripe Checkout) that went through: it is recorded on the invoice (so the receipt shows "Paid in full" by itself), the customer gets
// the payment receipt (PDF) by e-mail and in the website space, and JP's gets an e-mail saying who paid. Called by the pay page (when the customer comes
// back) and by the Stripe webhook (if they close the page): whichever comes first records it, the other finds it already recorded.
import { db, nowStr, timeNow, r2, balance, total, money, wrCode, custOf, CARD_FEE_LABEL } from "./wh-store";
import { ensureLoaded, refresh, lockActions, flush, saveDoc } from "./persist";
import { logAudit } from "./audit";
import { getSession, intentOf, methodOf, type Session } from "./stripe";
import { queueMail } from "./auto-mail";
import { mailEnabled, mailTo } from "./mail";
import { usableEmail } from "./mailrules";
import { paymentReceiptPdf } from "./pdf";
import { OWNER_ALERT, payBase } from "./paylink";
import { queueSiteReceipts } from "./site-receipts";

export type Settled = { ok: true; already: boolean; wr: string; invoice: string; amount: number; index: number } | { ok: false; error: string; pending?: boolean };
type Lang = "fr" | "en" | "es";

export async function settleSession(sessionId: string, source = "Stripe"): Promise<Settled> {
  const got = await getSession(sessionId);
  if (!got.ok) return { ok: false, error: got.error };
  const s: Session = got.data;
  if (s.payment_status !== "paid") return { ok: false, error: "The payment is not complete yet.", pending: s.payment_status === "unpaid" && s.status !== "expired" };
  const wrId = s.metadata?.wr ?? "", invNo = s.metadata?.invoice ?? s.client_reference_id ?? "", ref = `stripe:${intentOf(s)}`;
  await ensureLoaded(); await refresh();
  const unlock = await lockActions();
  let out: Settled = { ok: false, error: "Unknown invoice." }, mails: (() => Promise<unknown>) | null = null;
  try {
    await refresh(false, true);
    const w = db.wrs.find((x) => (wrId ? x.id === wrId : x.invoice === invNo));
    if (!w) return out;
    const inv = w.invoice ?? wrCode(w);
    const dup = w.payments.findIndex((p) => p.ref === ref);
    if (dup >= 0) return (out = { ok: true, already: true, wr: w.id, invoice: inv, amount: w.payments[dup].amount, index: dup });
    // The card fee the customer was charged (a separate line on Stripe's page) goes on the receipt, so the invoice shows it and the payment covers it.
    const feeCents = Number(s.metadata?.fee_cents ?? 0);
    if (feeCents > 0) w.fees.push({ id: db.n.fee++, label: CARD_FEE_LABEL, amount: r2(feeCents / 100), kind: "charge", auto: "card" });
    const amount = r2((s.amount_total ?? 0) / 100), pay = r2(Math.min(amount, Math.max(0, balance(w)))), extra = r2(amount - pay), c = custOf(w);
    const method = methodOf(s), batch = `PAY-${db.n.pay++}`, date = nowStr(), time = timeNow();
    const payer = s.customer_details?.name || w.customer, payerEmail = s.customer_details?.email || "";
    if (pay > 0) w.payments.push({ date, time, amount: pay, method, ref, batch, online: true, payer, payerEmail });
    // Paid more than the balance (the invoice was paid another way while the customer was on Stripe's page): the rest stays as the customer's credit.
    if (extra > 0 && c) (c.creditLog ??= []).push({ date, time, amount: extra, note: `Paid online more than owed (${inv})`, batch, method, ref });
    if (!db.payMethods.includes(method)) db.payMethods.push(method);
    const index = pay > 0 ? w.payments.length - 1 : -1;
    logAudit(`${source} (online)`, "online payment", `${inv} ${money(amount)} ${method} ${ref}`, "ok");
    out = { ok: true, already: false, wr: w.id, invoice: inv, amount, index };
    const snap = { invoiceNo: w.invoice ?? "", inv, wr: wrCode(w), name: w.customer, cust: w.cust, amount, method, ref, payer, payerEmail, bal: Math.max(0, balance(w)), tot: total(w), lang: ((c?.lang === "en" || c?.lang === "es") ? c.lang : "fr") as Lang, email: (c && usableEmail(c)) || (w.email && usableEmail({ email: w.email }) ? w.email : "") || payerEmail, id: w.id, index };
    mails = () => notify(snap);
  } finally { await flush().catch(() => {}); unlock(); }
  if (mails) { queueMail(mails); queueSiteReceipts(); }
  return out;
}

type Snap = { invoiceNo: string; inv: string; wr: string; name: string; cust: number; amount: number; method: string; ref: string; payer: string; payerEmail: string; bal: number; tot: number; lang: Lang; email: string; id: string; index: number };
const usd = (n: number) => `$${n.toFixed(2)}`;
const maillog = (subject: string, to: string, error?: string) => { db.maillog.unshift({ id: db.n.mail++, date: nowStr(), time: timeNow(), by: "online payment", subject, to, sent: error ? 0 : 1, total: 1, failed: error ? [error] : [] }); db.maillog.length = Math.min(db.maillog.length, 200); };
async function notify(a: Snap) {
  if (!mailEnabled()) { maillog(`Online payment ${a.inv}`, OWNER_ALERT, "E-mail is not set up (SUPABASE_URL, SITE_STAFF_EMAIL, SITE_STAFF_PASSWORD)."); return; }
  const base = payBase(), isInv = !!a.invoiceNo, fr = isInv ? "facture" : "reçu", en = isInv ? "invoice" : "receipt", es = isInv ? "factura" : "recibo";
  // 1. JP's: who paid.
  const subjectO = `Paiement en ligne : ${a.name} a payé ${usd(a.amount)} (${fr} ${a.inv})`;
  const bodyO = `${a.name} (client n° ${a.cust}) vient de payer en ligne.\n\nMontant : ${usd(a.amount)}\n${isInv ? "Facture" : "Reçu"} : ${a.inv}${isInv ? ` (reçu ${a.wr})` : ""}\nMoyen de paiement : ${a.method}\nPayé par : ${a.payer}${a.payerEmail ? ` <${a.payerEmail}>` : ""}\nRéférence Stripe : ${a.ref.replace(/^stripe:/, "")}\nTotal de la facture : ${usd(a.tot)}\nSolde restant : ${a.bal > 0.004 ? usd(a.bal) : "0.00 (payée en entier)"}\n\nLe paiement est déjà enregistré sur la facture.${base ? `\nVoir la facture : ${base}/invoices/${encodeURIComponent(a.inv)}` : ""}`;
  const eO = await mailTo({ email: OWNER_ALERT, name: "JP's Logistics", lang: "fr" }, subjectO, bodyO);
  maillog(subjectO, OWNER_ALERT, eO ?? undefined);
  // 2. The customer: the payment receipt (PDF).
  if (!a.email) { maillog(`Reçu de paiement ${a.inv}`, a.name, "no usable e-mail"); return; }
  const w = db.wrs.find((x) => x.id === a.id);
  if (!w || a.index < 0) return;
  const pdf = await paymentReceiptPdf(w, a.index), name = `Payment-receipt-${a.inv}.pdf`;
  const T = {
    fr: { s: `Reçu de paiement : ${fr} ${a.inv}`, b: `Bonjour ${a.payer},\n\nNous avons bien reçu votre paiement de ${usd(a.amount)} pour ${isInv ? `la facture ${a.inv} (reçu ${a.wr})` : `le reçu ${a.inv}`}. Merci !\n\nMoyen de paiement : ${a.method}\nSolde restant : ${a.bal > 0.004 ? usd(a.bal) : `0.00 (${fr} payé${isInv ? "e" : ""} en entier)`}\n\nVotre reçu de paiement est joint en PDF. Vous le retrouvez aussi dans votre espace client sur jpslogistics.me.` },
    en: { s: `Payment receipt: ${en} ${a.inv}`, b: `Dear ${a.payer},\n\nWe received your payment of ${usd(a.amount)} for ${isInv ? `invoice ${a.inv} (receipt ${a.wr})` : `receipt ${a.inv}`}. Thank you!\n\nPayment method: ${a.method}\nBalance left: ${a.bal > 0.004 ? usd(a.bal) : `0.00 (${en} paid in full)`}\n\nYour payment receipt is attached as a PDF. You can also find it in your customer space on jpslogistics.me.` },
    es: { s: `Recibo de pago: ${es} ${a.inv}`, b: `Estimado/a ${a.payer},\n\nRecibimos su pago de ${usd(a.amount)} por ${isInv ? `la factura ${a.inv} (recibo ${a.wr})` : `el recibo ${a.inv}`}. ¡Gracias!\n\nMétodo de pago: ${a.method}\nSaldo restante: ${a.bal > 0.004 ? usd(a.bal) : `0.00 (${es} pagad${isInv ? "a" : "o"} por completo)`}\n\nSu recibo de pago va adjunto en PDF. También lo encuentra en su espacio de cliente en jpslogistics.me.` },
  }[a.lang];
  const eC = await mailTo({ email: a.email, name: a.payer, lang: a.lang }, T.s, T.b, [{ name, content: Buffer.from(pdf).toString("base64") }]);
  maillog(T.s, a.email, eC ?? undefined);
  if (!eC) await saveDoc({ kind: "payment", ref: a.inv, name, note: `sent to ${a.email}`, data: pdf });
}
