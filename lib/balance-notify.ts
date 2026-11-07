// "Send the balance": what a customer still owes, by e-mail (PDF attached) and WhatsApp (PDF attached), in the customer's language.
import { db, custOf, wrCode, total, paidAmt, balance, orderTotal, orderPaid, orderBalance, debtBalance, creditOf, money, r2, type Customer } from "./wh-store";
import { mailEnabled, mailTo } from "./mail";
import { usableEmail } from "./mailrules";
import { balancePdf, batchReceiptPdf, paymentReceiptPdf, type OweLine } from "./pdf";
import { waNotifyNow } from "./whatsapp";
import { nowStr, timeNow } from "./wh-store";

type Lang = "fr" | "en" | "es";
export function owedLines(no: number): OweLine[] {
  const L: OweLine[] = [];
  for (const w of db.wrs) if (w.cust === no && w.invoice && balance(w) > 0.004) L.push({ date: w.invoiceDate ?? w.date, what: `${w.invoice} (${wrCode(w)})`, total: total(w), paid: paidAmt(w), owed: balance(w) });
  for (const o of db.orders) if (o.cust === no && orderBalance(o) > 0.004) L.push({ date: o.date, what: `Order #${o.id}`, total: orderTotal(o), paid: orderPaid(o), owed: orderBalance(o) });
  for (const d of db.debts) if (d.cust === no && debtBalance(d) > 0.004) L.push({ date: d.date, what: `Account balance: ${d.note}`, total: d.amount, paid: r2(d.amount - debtBalance(d)), owed: debtBalance(d) });
  return L;
}
export const owedTotal = (no: number) => r2(owedLines(no).reduce((a, l) => a + l.owed, 0));
const langOf = (c: Customer): Lang => (c.lang === "en" || c.lang === "es" ? c.lang : "fr");
const T = {
  fr: { subject: (n: string) => `Votre solde chez JP's Logistics & More : ${n}`, hi: (n: string) => `Bonjour ${n},`, intro: "Voici le solde de votre compte chez nous.", total: "Solde à payer", detail: "Le détail est dans le PDF ci-joint.", bye: "Merci de votre confiance !", file: "Solde", auto: "Ceci est un message automatique." },
  en: { subject: (n: string) => `Your balance with JP's Logistics & More: ${n}`, hi: (n: string) => `Hello ${n},`, intro: "Here is the balance of your account with us.", total: "Balance due", detail: "The details are in the attached PDF.", bye: "Thank you for your business!", file: "Balance", auto: "This is an automated message." },
  es: { subject: (n: string) => `Su saldo en JP's Logistics & More: ${n}`, hi: (n: string) => `Hola ${n},`, intro: "Este es el saldo de su cuenta con nosotros.", total: "Saldo a pagar", detail: "El detalle está en el PDF adjunto.", bye: "¡Gracias por su confianza!", file: "Saldo", auto: "Este es un mensaje automático." },
};
const body = (c: Customer, lines: OweLine[], wa: boolean) => {
  const l = langOf(c), t = T[l], sum = money(owedTotal(c.no));
  const items = lines.slice(0, 12).map((x) => `• ${x.what} : ${money(x.owed)}`).join("\n") + (lines.length > 12 ? "\n• ..." : "");
  return [t.hi(c.name), "", t.intro, "", items, "", `${wa ? "" : "**"}${t.total} : ${sum}${wa ? "" : "**"}`, "", t.detail, "", t.bye, ...(wa ? ["", t.auto, "", "JP's Logistics & More"] : [])].join("\n");
};
export type BalResult = { mailErr: string | null; waErr: string | null };
export async function sendBalance(no: number, channel: string): Promise<BalResult> {
  const c = db.customers.find((x) => x.no === no), r: BalResult = { mailErr: null, waErr: null };
  if (!c) return { mailErr: "no customer", waErr: null };
  const lines = owedLines(no);
  if (!lines.length) return { mailErr: channel === "wa" ? null : "nothing to pay", waErr: channel === "email" ? null : "nothing to pay" };
  const bytes = await balancePdf(c, lines, creditOf(c)), name = `${T[langOf(c)].file}-${c.no}.pdf`;
  if (channel !== "wa") {
    const email = usableEmail(c);
    r.mailErr = !mailEnabled() ? "E-mail is not set up" : !email ? "no usable e-mail (missing, shared or company address)" : (await mailTo({ email, name: c.name, lang: langOf(c) }, T[langOf(c)].subject(money(owedTotal(no))), body(c, lines, false), [{ name, content: Buffer.from(bytes).toString("base64") }])) ?? "";
    db.maillog.unshift({ id: db.n.mail++, date: nowStr(), time: timeNow(), by: "button", subject: `Balance ${money(owedTotal(no))}`, to: email ?? c.name, sent: r.mailErr ? 0 : 1, total: 1, failed: r.mailErr ? [r.mailErr] : [] });
  }
  if (channel !== "email") r.waErr = await waNotifyNow(c, body(c, lines, true), `balance ${money(owedTotal(no))}`, async () => ({ name, bytes }));
  return r;
}

// ---------- "Send the payment receipt": a payment that was received (a Receive-payment batch, or one payment on a receipt) ----------
const PT = {
  fr: { s: (a: string) => `Reçu de paiement : ${a}`, intro: (a: string, m: string) => `Nous avons bien reçu votre paiement de ${a} (${m}). Merci !`, left: "Reste à payer", paid: "Votre compte est entièrement payé.", detail: "Le reçu de paiement est dans le PDF ci-joint.", file: "Recu-paiement" },
  en: { s: (a: string) => `Payment receipt: ${a}`, intro: (a: string, m: string) => `We received your payment of ${a} (${m}). Thank you!`, left: "Balance still due", paid: "Your account is paid in full.", detail: "Your payment receipt is in the attached PDF.", file: "Payment-receipt" },
  es: { s: (a: string) => `Recibo de pago: ${a}`, intro: (a: string, m: string) => `Recibimos su pago de ${a} (${m}). ¡Gracias!`, left: "Saldo pendiente", paid: "Su cuenta está pagada por completo.", detail: "Su recibo de pago está en el PDF adjunto.", file: "Recibo-pago" },
};
// key = "PAY-12" (a batch) or "<receipt id>:<payment index>"
function paymentOf(key: string) {
  const [a, b] = key.split(":");
  if (b !== undefined) { const w = db.wrs.find((x) => x.id === a), p = w?.payments[Number(b)]; return w && p ? { c: custOf(w), amount: p.amount, method: p.method, pdf: () => paymentReceiptPdf(w, Number(b)), no: `${wrCode(w)}-P${Number(b) + 1}` } : null; }
  const ps = [...db.wrs.flatMap((w) => w.payments.filter((p) => p.batch === a).map((p) => ({ no: w.cust, p }))), ...db.debts.flatMap((d) => d.payments.filter((p) => p.batch === a).map((p) => ({ no: d.cust, p })))];
  const kept = db.customers.flatMap((c) => (c.creditLog ?? []).filter((e) => e.batch === a).map((e) => ({ no: c.no, p: { amount: e.amount, method: e.method ?? "" } })));
  const all = [...ps, ...kept];
  if (!all.length) return null;
  return { c: db.customers.find((x) => x.no === all[0].no), amount: r2(all.reduce((s, x) => s + x.p.amount, 0)), method: all[0].p.method, pdf: () => batchReceiptPdf(a), no: a };
}
export async function sendPaymentNotice(key: string, channel: string): Promise<BalResult> {
  const pay = paymentOf(key), r: BalResult = { mailErr: null, waErr: null };
  if (!pay?.c) return { mailErr: "payment not found", waErr: null };
  const c = pay.c, l = langOf(c), t = PT[l], amt = money(pay.amount), owed = owedTotal(c.no);
  const bytes = await pay.pdf(), name = `${t.file}-${pay.no}.pdf`;
  const text = (wa: boolean) => [T[l].hi(c.name), "", t.intro(amt, pay.method), "", owed > 0 ? `${t.left} : ${money(owed)}` : t.paid, "", t.detail, "", T[l].bye, ...(wa ? ["", T[l].auto, "", "JP's Logistics & More"] : [])].join("\n");
  if (channel !== "wa") {
    const email = usableEmail(c);
    r.mailErr = !mailEnabled() ? "E-mail is not set up" : !email ? "no usable e-mail (missing, shared or company address)" : (await mailTo({ email, name: c.name, lang: l }, t.s(amt), text(false), [{ name, content: Buffer.from(bytes).toString("base64") }])) ?? "";
    db.maillog.unshift({ id: db.n.mail++, date: nowStr(), time: timeNow(), by: "button", subject: `Payment receipt ${pay.no}`, to: email ?? c.name, sent: r.mailErr ? 0 : 1, total: 1, failed: r.mailErr ? [r.mailErr] : [] });
  }
  if (channel !== "email") r.waErr = await waNotifyNow(c, text(true), `payment receipt ${pay.no}`, async () => ({ name, bytes }));
  return r;
}
