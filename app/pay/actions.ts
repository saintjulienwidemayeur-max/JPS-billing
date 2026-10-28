"use server";
// Public (no sign-in): the customer's "Pay online" button. The invoice comes from the signed link, never from the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureLoaded, refresh } from "@/lib/persist";
import { db, balance, r2, wrCode, custOf } from "@/lib/wh-store";
import { readPayToken, payBase, payToken } from "@/lib/paylink";
import { createCheckout, stripeReady } from "@/lib/stripe";
import { usableEmail } from "@/lib/mailrules";

export async function startCheckout(token: string) {
  const here = `/pay/${token}`;
  const inv = readPayToken(token);
  if (!inv) redirect(`${here}?err=link`);
  await ensureLoaded(); await refresh();
  const w = db.wrs.find((x) => x.invoice === inv);
  if (!w) redirect(`${here}?err=link`);
  const bal = r2(balance(w!));
  if (bal <= 0) redirect(`${here}?err=paid`);
  if (!stripeReady()) redirect(`${here}?err=off`);
  const h = await headers();
  const origin = payBase(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`);
  const c = custOf(w!), tok = payToken(inv!);
  const r = await createCheckout({
    invoice: inv!, wr: wrCode(w!), cust: w!.cust, cents: Math.round(bal * 100), name: `Invoice ${inv} - ${w!.customer}`,
    email: (c && usableEmail(c)) || (w!.email && usableEmail({ email: w!.email }) ? w!.email : undefined), lang: c?.lang ?? "fr",
    successUrl: `${origin}/pay/${tok}/done?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${origin}/pay/${tok}?canceled=1`,
  });
  if (!r.ok || !r.data.url) { console.error("[stripe]", r.ok ? "no url" : r.error); redirect(`${here}?err=stripe`); }
  redirect(r.data.url!);
}
