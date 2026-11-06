// "Send the balance": what a customer still owes, by e-mail (PDF attached) and WhatsApp (PDF attached), in the customer's language.
import { db, custOf, wrCode, total, paidAmt, balance, orderTotal, orderPaid, orderBalance, debtBalance, creditOf, money, r2, type Customer } from "./wh-store";
import { mailEnabled, mailTo } from "./mail";
import { usableEmail } from "./mailrules";
import { balancePdf, type OweLine } from "./pdf";
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
