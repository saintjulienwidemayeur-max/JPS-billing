// Opens the Stripe Checkout page for the balance of a receipt. Used by the pay page of this app and by the API the website's pay page calls.
import { balance, r2, wrCode, custOf, type WR } from "./wh-store";
import { createCheckout, stripeReady } from "./stripe";
import { usableEmail } from "./mailrules";

export async function openCheckout(w: WR, urls: { success: string; cancel: string }): Promise<{ url: string } | { error: "paid" | "off" | "stripe" }> {
  const bal = r2(balance(w));
  if (bal <= 0) return { error: "paid" };
  if (!stripeReady()) return { error: "off" };
  const c = custOf(w);
  const r = await createCheckout({
    invoice: w.invoice ?? "", wr: w.id, cust: w.cust, cents: Math.round(bal * 100), name: w.invoice ? `Invoice ${w.invoice} - ${w.customer}` : `Receipt ${wrCode(w)} - ${w.customer}`,
    email: (c && usableEmail(c)) || (w.email && usableEmail({ email: w.email }) ? w.email : undefined), lang: c?.lang ?? "fr", successUrl: urls.success, cancelUrl: urls.cancel,
  });
  if (!r.ok || !r.data.url) { console.error("[stripe]", r.ok ? "no url" : r.error); return { error: "stripe" }; }
  return { url: r.data.url };
}
