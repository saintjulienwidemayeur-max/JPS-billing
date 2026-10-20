// The invoice goes to the customer by e-mail (PDF attached) by itself when it is made: nobody presses anything.
// Logged in the maillog, and the PDF that was sent is kept (wh_docs).
import { db, nowStr, timeNow, custOf, total, balance, paidAmt, orderTotal, orderPaid, orderBalance, type WR, type Order } from "./wh-store";
import { flush, saveDoc } from "./persist";
import { mailEnabled, mailTo } from "./mail";
import { usableEmail } from "./mailrules";
import { invoicePdf, orderPdf } from "./pdf";
import { PAY } from "./company";

const g = globalThis as unknown as { __mailQ?: Promise<void> };
// One job at a time, after the request that asked for it has answered.
export function queueMail(job: () => Promise<unknown>) {
  g.__mailQ = (g.__mailQ ?? Promise.resolve()).then(async () => { try { await job(); } catch (e) { console.error("[auto-mail]", e instanceof Error ? e.message : e); } finally { await flush().catch(() => {}); } });
}
type Lang = "fr" | "en" | "es";
const usd = (n: number, lang: Lang) => (lang === "en" ? `${n.toFixed(2)} USD` : `${n.toFixed(2).replace(".", ",")} USD`);
// What every customer e-mail about money says: how to pay, then the sign-off.
const payBlock = (lang: Lang) => {
  const p = PAY;
  if (lang === "en") return `Please bring cash or a check payable to "${p.checkTo}" to hand over at pickup or delivery.
For electronic transfers, please use one of the following methods:
${p.haiti.bank}: ${p.haiti.kind === "COMPTE COURANT" ? "CHECKING ACCOUNT" : p.haiti.kind}
NAME: ${p.haiti.name}
GOURDES ACCOUNT: ${p.haiti.gourdes}
DOLLAR (USD) ACCOUNT: ${p.haiti.usd}
- Zelle at: ${p.zelle}
- For credit card processing fees, please ask for an online invoice.

- Local US bank transfer to:
${p.us.name}
${p.us.bank} routing number: ${p.us.routing}
SWIFT code: ${p.us.swift}
Account number: ${p.us.account}`;
  if (lang === "es") return `Por favor, traiga efectivo o un cheque a nombre de "${p.checkTo}" para entregar en el momento de la recogida o la entrega.
Para transferencias electrónicas, utilice uno de los siguientes métodos:
${p.haiti.bank}: CUENTA CORRIENTE
NOMBRE: ${p.haiti.name}
CUENTA EN GOURDES: ${p.haiti.gourdes}
CUENTA EN DÓLARES (USD): ${p.haiti.usd}
- Zelle al: ${p.zelle}
- Para los cargos de procesamiento de pagos con tarjeta de crédito, solicite una factura en línea.

- Transferencia bancaria local en EE. UU. a:
${p.us.name}
Número de ruta de ${p.us.bank}: ${p.us.routing}
Código SWIFT: ${p.us.swift}
Número de cuenta: ${p.us.account}`;
  return `Veuillez vous munir d'espèces ou d'un chèque à l'ordre de « ${p.checkTo} » à remettre lors de l'enlèvement ou de la livraison.
Pour les virements électroniques, veuillez utiliser l'une des méthodes suivantes :
${p.haiti.bank} : ${p.haiti.kind}
NOM : ${p.haiti.name}
COMPTE GOURDES : ${p.haiti.gourdes}
COMPTE DOLLARS (USD) : ${p.haiti.usd}
- Zelle au : ${p.zelle}
- Pour les frais de traitement des paiements par carte de crédit, veuillez demander une facture en ligne.

- Virement bancaire local américain à :
${p.us.name}
Numéro de routage de ${p.us.bank} : ${p.us.routing}
Code SWIFT : ${p.us.swift}
Numéro de compte : ${p.us.account}`;
};
const signoff = (lang: Lang) => ({
  fr: `Nous sommes ravis de vous compter parmi nos nombreux clients et espérons avoir le plaisir de vous servir à nouveau très prochainement.\nVotre serviteur,\nJP's Logistics & More\n${PAY.address.join("\n")}\nTél. : ${PAY.phone}`,
  en: `We are delighted to count you among our many customers and hope to have the pleasure of serving you again very soon.\nYour servant,\nJP's Logistics & More\n${PAY.addressEn.join("\n")}\nTel.: ${PAY.phone}`,
  es: `Nos complace contarle entre nuestros muchos clientes y esperamos tener el placer de atenderle de nuevo muy pronto.\nSu servidor,\nJP's Logistics & More\n${PAY.addressEn.join("\n")}\nTel.: ${PAY.phone}`,
}[lang]);
const thanks = (lang: Lang) => ({ fr: "Merci d'avoir pensé à JP'S LOGISTICS & MORE pour vos besoins en logistique et en expédition.", en: "Thank you for thinking of JP'S LOGISTICS & MORE for your logistics and shipping needs.", es: "Gracias por pensar en JP'S LOGISTICS & MORE para sus necesidades de logística y envío." }[lang]);
const T = {
  fr: { subject: (n: string) => `Votre facture ${n}`, body: (name: string, n: string, r: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("fr")}\nVous trouverez ci-joint votre facture de ${usd(t, "fr")}, correspondant au coût des biens et/ou services fournis.${paid > 0 ? ` Déjà payé : ${usd(paid, "fr")}. Solde à payer : ${usd(b, "fr")}.` : ""} ${payBlock("fr")}\n${signoff("fr")}`,
    oSubject: (n: string) => `Votre commande ${n} : facture`, oBody: (name: string, n: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("fr")}\nVous trouverez ci-joint la facture de votre commande n° ${n} de ${usd(t, "fr")}, correspondant au coût des articles achetés et des frais.${paid > 0 ? ` Déjà payé : ${usd(paid, "fr")}.` : ""}${b > 0 ? ` Solde à payer : ${usd(b, "fr")}. ${payBlock("fr")}` : " Votre commande est payée en totalité. Merci !"}\n${signoff("fr")}` },
  en: { subject: (n: string) => `Your invoice ${n}`, body: (name: string, n: string, r: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("en")}\nPlease find attached your invoice for ${usd(t, "en")}, covering the cost of the goods and/or services provided.${paid > 0 ? ` Already paid: ${usd(paid, "en")}. Balance to pay: ${usd(b, "en")}.` : ""} ${payBlock("en")}\n${signoff("en")}`,
    oSubject: (n: string) => `Your order ${n}: invoice`, oBody: (name: string, n: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("en")}\nPlease find attached the invoice for your order no. ${n} of ${usd(t, "en")}, covering the cost of the items purchased and the fees.${paid > 0 ? ` Already paid: ${usd(paid, "en")}.` : ""}${b > 0 ? ` Balance to pay: ${usd(b, "en")}. ${payBlock("en")}` : " Your order is paid in full. Thank you!"}\n${signoff("en")}` },
  es: { subject: (n: string) => `Su factura ${n}`, body: (name: string, n: string, r: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("es")}\nEncontrará adjunta su factura por ${usd(t, "es")}, correspondiente al costo de los bienes y/o servicios prestados.${paid > 0 ? ` Ya pagado: ${usd(paid, "es")}. Saldo a pagar: ${usd(b, "es")}.` : ""} ${payBlock("es")}\n${signoff("es")}`,
    oSubject: (n: string) => `Su pedido ${n}: factura`, oBody: (name: string, n: string, t: number, b: number, paid: number) => `Dear ${name},\n\n${thanks("es")}\nEncontrará adjunta la factura de su pedido n.º ${n} por ${usd(t, "es")}, correspondiente al costo de los artículos comprados y los cargos.${paid > 0 ? ` Ya pagado: ${usd(paid, "es")}.` : ""}${b > 0 ? ` Saldo a pagar: ${usd(b, "es")}. ${payBlock("es")}` : " Su pedido está pagado en su totalidad. ¡Gracias!"}\n${signoff("es")}` },
};
const log = (subject: string, to: string, error?: string) => {
  db.maillog.unshift({ id: db.n.mail++, date: nowStr(), time: timeNow(), by: "automatic", subject, to, sent: error ? 0 : 1, total: 1, failed: error ? [error] : [] });
  db.maillog.length = Math.min(db.maillog.length, 200);
};

// `force` (the "Notify by e-mail" button) sends again even if it was already sent. Returns an error text, or "".
export async function emailInvoice(w: WR, force = false): Promise<string> {
  if (!w.invoice || (w.invoiceSent && !force)) return "";
  const tries = (w.invoiceMail?.tries ?? 0) + 1;
  const fail = (e: string, again: boolean) => { w.invoiceMail = { error: e, tries: again ? tries : 99, at: `${nowStr()} ${timeNow()}` }; };
  const c = custOf(w), lang = (c?.lang === "en" || c?.lang === "es" ? c.lang : "fr") as Lang, tx = T[lang];
  const email = (c && usableEmail(c)) ?? (w.email && usableEmail({ email: w.email }) ? w.email : undefined);
  const subject = tx.subject(w.invoice);
  if (!mailEnabled()) { const e = "E-mail is not set up (SUPABASE_URL, SITE_STAFF_EMAIL, SITE_STAFF_PASSWORD)."; log(subject, c?.name ?? w.customer, e); fail(e, false); return e; }
  if (!email) { const e = "no usable e-mail (missing, shared or company address)"; log(subject, c?.name ?? w.customer, e); fail(e, false); return e; }
  const pdf = await invoicePdf(w), name = `Invoice-${w.invoice}.pdf`;
  const error = await mailTo({ email, name: c?.name ?? w.customer, lang }, subject, tx.body(c?.name ?? w.customer, w.invoice, "", total(w), Math.max(0, balance(w)), paidAmt(w)), [{ name, content: Buffer.from(pdf).toString("base64") }]);
  log(subject, email, error ?? undefined);
  if (error) { fail(error, true); return error; }
  await saveDoc({ kind: "invoice", ref: w.invoice, name, note: `sent to ${email}`, data: pdf });
  w.invoiceSent = nowStr(); w.invoiceMail = undefined;
  return "";
}

// A failed send (network, the e-mail service) is tried again, up to 4 times in all; checked at most every 15 minutes (called from the layout).
let last = 0;
export function retryInvoiceMails() {
  if (Date.now() - last < 900_000) return; last = Date.now();
  for (const w of db.wrs) if (w.invoice && !w.invoiceSent && w.invoiceMail && w.invoiceMail.tries < 4) queueMail(() => emailInvoice(w));
}

// The order's invoice (PDF) by e-mail: from the "Notify by e-mail" button of the order. Returns an error text, or "".
export async function emailOrder(o: Order): Promise<string> {
  const c = db.customers.find((x) => x.no === o.cust), lang = (c?.lang === "en" || c?.lang === "es" ? c.lang : "fr") as Lang, tx = T[lang];
  const subject = tx.oSubject(o.id), who = c?.name ?? o.customer;
  if (!mailEnabled()) { const e = "E-mail is not set up (SUPABASE_URL, SITE_STAFF_EMAIL, SITE_STAFF_PASSWORD)."; log(subject, who, e); return e; }
  const email = c && usableEmail(c);
  if (!email) { const e = "no usable e-mail (missing, shared or company address)"; log(subject, who, e); return e; }
  const pdf = await orderPdf(o), name = `Order-${o.id}.pdf`;
  const error = await mailTo({ email, name: who, lang }, subject, tx.oBody(who, o.id, orderTotal(o), Math.max(0, orderBalance(o)), orderPaid(o)), [{ name, content: Buffer.from(pdf).toString("base64") }]);
  log(subject, email, error ?? undefined);
  if (error) return error;
  await saveDoc({ kind: "order", ref: o.id, name, note: `sent to ${email}`, data: pdf });
  return "";
}
