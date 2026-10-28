import { verifyWebhook } from "@/lib/stripe";
import { settleSession } from "@/lib/online-pay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stripe calls this when a payment succeeds (set it up in Stripe: Developers > Webhooks, events checkout.session.completed and
// checkout.session.async_payment_succeeded, and put its signing secret in STRIPE_WEBHOOK_SECRET). The payment is recorded even if the customer never comes back to the site.
export async function POST(req: Request) {
  const raw = await req.text();
  const v = verifyWebhook(raw, req.headers.get("stripe-signature"));
  if (!v.ok) return new Response(v.error, { status: 400 });
  const { type, data } = v.event;
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const r = await settleSession(data.object.id, "Stripe webhook");
    // A payment still processing (async methods) is answered 200: Stripe sends async_payment_succeeded later.
    if (!r.ok && !r.pending && r.error !== "Unknown invoice.") { console.error("[stripe webhook]", r.error); return new Response(r.error, { status: 500 }); }
  }
  return new Response("ok");
}
