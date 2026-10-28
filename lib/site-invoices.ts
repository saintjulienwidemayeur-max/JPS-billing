// Keeps the customer's space on the website up to date: every invoice with what was paid, the pay link, and a receipt link for each payment.
// A customer with no website account has nothing to push (the pay link in the e-mail still works). Runs after the request has answered.
import { db, total, paidAmt, balance, wrCode, type WR } from "./wh-store";
import { flush } from "./persist";
import { syncEnabled, findClientId, pushSiteInvoice, dropSiteInvoice } from "./jps-sync";
import { payUrl, receiptUrl } from "./paylink";

const g = globalThis as unknown as { __siteQ?: Promise<void>; __siteLast?: number };
const sigOf = (w: WR) => `${w.invoice}|${total(w)}|${paidAmt(w)}|${w.payments.map((p) => p.amount + p.method + p.ref).join(",")}|${payUrl(w.invoice) ? 1 : 0}`;
const cache = new Map<number, string>();
async function clientIdOf(cust: number): Promise<string | undefined> {
  const c = db.customers.find((x) => x.no === cust);
  if (!c) return undefined;
  if (c.clientId) return c.clientId;
  if (cache.has(cust)) return cache.get(cust) || undefined;
  const r = await findClientId(c.box || c.email || "");
  cache.set(cust, r.id ?? ""); return r.id;
}
async function run() {
  for (const w of db.wrs) {
    try {
      if (w.siteInv && w.siteInv !== w.invoice) { const e = await dropSiteInvoice(w.siteInv); if (!e) { w.siteInv = undefined; w.siteSig = undefined; } else console.error("[site-invoices]", e); }
      if (!w.invoice) continue;
      const sig = sigOf(w);
      if (w.siteSig === sig) continue;
      const cid = await clientIdOf(w.cust);
      if (!cid) { w.siteSig = sig; continue; }
      const paid = paidAmt(w), bal = Math.max(0, balance(w));
      const e = await pushSiteInvoice(
        { client_id: cid, invoice_no: w.invoice, receipt_code: wrCode(w), issued: w.invoiceDate ?? w.date, total: total(w), paid, balance: bal, status: paid <= 0 ? "unpaid" : bal <= 0.004 ? "paid" : "partial", pay_url: payBalance(w) },
        w.payments.map((p, i) => ({ paid_on: `${p.date}${p.time ? " " + p.time : ""}`, amount: p.amount, method: p.method, reference: (p.ref ?? "").replace(/^stripe:/, ""), receipt_url: receiptUrl(w.invoice!, i) })),
      );
      if (e) console.error("[site-invoices]", w.invoice, e); else { w.siteSig = sig; w.siteInv = w.invoice; }
    } catch (e) { console.error("[site-invoices]", e instanceof Error ? e.message : e); }
  }
}
const payBalance = (w: WR) => (balance(w) > 0.004 ? payUrl(w.invoice) : "");
export function queueSiteInvoices() {
  if (!syncEnabled()) return;
  g.__siteQ = (g.__siteQ ?? Promise.resolve()).then(async () => { try { await run(); } finally { await flush().catch(() => {}); } });
}
// From the layout: at most every 5 minutes, for payments entered in the warehouse app.
export function syncSiteInvoicesSoon() {
  if (Date.now() - (g.__siteLast ?? 0) < 300_000) return; g.__siteLast = Date.now();
  queueSiteInvoices();
}
