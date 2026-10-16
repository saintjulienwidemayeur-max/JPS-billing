// The invoice goes to the customer by e-mail (PDF attached) by itself when it is made: nobody presses anything.
// Logged in the maillog, and the PDF that was sent is kept (wh_docs).
import { db, nowStr, timeNow, custOf, total, balance, money, wrCode, type WR } from "./wh-store";
import { flush, saveDoc } from "./persist";
import { mailEnabled, mailTo } from "./mail";
import { usableEmail } from "./mailrules";
import { invoicePdf } from "./pdf";
import { COMPANY } from "./company";

const g = globalThis as unknown as { __mailQ?: Promise<void> };
// One job at a time, after the request that asked for it has answered.
export function queueMail(job: () => Promise<unknown>) {
  g.__mailQ = (g.__mailQ ?? Promise.resolve()).then(async () => { try { await job(); } catch (e) { console.error("[auto-mail]", e instanceof Error ? e.message : e); } finally { await flush().catch(() => {}); } });
}
type Lang = "fr" | "en" | "es";
const T = {
  fr: { subject: (n: string) => `Votre facture ${n}`, body: (n: string, r: string, t: string, b: string) => `Votre facture ${n} (reçu ${r}) est jointe à ce message (PDF).\n\nTotal : ${t}\nSolde à payer : ${b}\n\nMerci pour votre confiance.` },
  en: { subject: (n: string) => `Your invoice ${n}`, body: (n: string, r: string, t: string, b: string) => `Your invoice ${n} (receipt ${r}) is attached to this message (PDF).\n\nTotal: ${t}\nBalance to pay: ${b}\n\nThank you for your trust.` },
  es: { subject: (n: string) => `Su factura ${n}`, body: (n: string, r: string, t: string, b: string) => `Su factura ${n} (recibo ${r}) está adjunta a este mensaje (PDF).\n\nTotal: ${t}\nSaldo a pagar: ${b}\n\nGracias por su confianza.` },
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
  const error = await mailTo({ email, name: c?.name ?? w.customer, lang }, subject, `${tx.body(w.invoice, wrCode(w), money(total(w)), money(balance(w)))}\n\n${COMPANY.name} · ${COMPANY.phone}`, [{ name, content: Buffer.from(pdf).toString("base64") }]);
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
