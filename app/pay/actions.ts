"use server";
// Public (no sign-in): the customer's "Pay online" button. The receipt comes from the signed link, never from the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureLoaded, refresh } from "@/lib/persist";
import { wrOfToken, payBase, payToken } from "@/lib/paylink";
import { openCheckout } from "@/lib/pay-checkout";

export async function startCheckout(token: string) {
  const here = `/pay/${token}`;
  await ensureLoaded(); await refresh();
  const w = wrOfToken(token);
  if (!w) redirect(`${here}?err=link`);
  const h = await headers();
  const origin = payBase(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`), tok = payToken(w!.id);
  const r = await openCheckout(w!, { success: `${origin}/pay/${tok}/done?session_id={CHECKOUT_SESSION_ID}`, cancel: `${origin}/pay/${tok}?canceled=1` });
  if ("error" in r) redirect(`${here}?err=${r.error}`);
  redirect((r as { url: string }).url);
}
