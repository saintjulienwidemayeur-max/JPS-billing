// Stripe, without the SDK: Checkout Sessions (the customer pays on Stripe's page with every payment method the account has turned on:
// cards, Apple Pay, Google Pay, Link, bank debits...) and the webhook signature. Server only.
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are read from the environment: they are never stored in the code or the database.
import crypto from "node:crypto";

// Quotes or a "STRIPE_SECRET_KEY=" typed by mistake in the Render value are ignored.
const key = () => (process.env.STRIPE_SECRET_KEY ?? "").trim().replace(/^STRIPE_SECRET_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
const api = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com/v1").replace(/\/$/, "");
export const stripeReady = () => /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key());
// For the pay page's technical code: "ok", "missing" (not set in THIS app) or "invalid" (set, but not a secret key: sk_test_… / sk_live_…).
export const stripeStatus = () => (stripeReady() ? "ok" : key() ? "invalid" : "missing");

type Form = [string, string][];
async function call<T>(method: "GET" | "POST", path: string, form: Form = [], idem?: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!key()) return { ok: false, error: "Online payment is not set up (STRIPE_SECRET_KEY)." };
  try {
    const body = new URLSearchParams(form);
    const r = await fetch(`${api()}${path}${method === "GET" && form.length ? `?${body}` : ""}`, {
      method, headers: { authorization: `Bearer ${key()}`, ...(method === "POST" && { "content-type": "application/x-www-form-urlencoded" }), ...(idem && { "idempotency-key": idem }) },
      ...(method === "POST" && { body }), signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
    if (!r.ok) return { ok: false, error: j.error?.message ?? `Stripe answered ${r.status}.` };
    return { ok: true, data: j as T };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export type Session = {
  id: string; url?: string; payment_status?: string; status?: string; amount_total?: number; currency?: string; client_reference_id?: string | null;
  metadata?: Record<string, string>; customer_details?: { name?: string | null; email?: string | null } | null;
  payment_intent?: string | { id: string; latest_charge?: string | { payment_method_details?: { type?: string; card?: { brand?: string; last4?: string; wallet?: { type?: string } | null } } } | null } | null;
};

// One Checkout Session for the balance of one invoice. The amount is in cents. Not given `payment_method_types`, Checkout shows every method turned on in the Stripe Dashboard.
export async function createCheckout(a: { invoice: string; wr: string; cust: number; cents: number; name: string; email?: string; lang: string; successUrl: string; cancelUrl: string }) {
  const f: Form = [
    ["mode", "payment"], ["success_url", a.successUrl], ["cancel_url", a.cancelUrl], ["client_reference_id", a.invoice || a.wr],
    ["line_items[0][quantity]", "1"], ["line_items[0][price_data][currency]", "usd"], ["line_items[0][price_data][unit_amount]", String(a.cents)],
    ["line_items[0][price_data][product_data][name]", a.name], ["line_items[0][price_data][product_data][description]", `JP's Logistics & More - receipt ${a.wr}`],
    ["metadata[invoice]", a.invoice], ["metadata[wr]", a.wr], ["metadata[cust]", String(a.cust)],
    ["payment_intent_data[metadata][invoice]", a.invoice], ["payment_intent_data[description]", `Invoice ${a.invoice}`],
    ["locale", ["fr", "en", "es"].includes(a.lang) ? a.lang : "auto"],
  ];
  if (a.email) f.push(["customer_email", a.email]);
  // Stripe refuses (or ignores) a parameter sent empty: a receipt with no invoice has no invoice number.
  const clean = f.filter(([, v]) => v !== "");
  // The same invoice and balance within a few minutes gives the same session: a double click does not open two payment pages.
  const idem = `${a.invoice || a.wr}-${a.cents}-${Math.floor(Date.now() / 600_000)}`;
  return call<Session>("POST", "/checkout/sessions", clean, idem);
}
export const getSession = (id: string) => call<Session>("GET", `/checkout/sessions/${encodeURIComponent(id)}`, [["expand[]", "payment_intent.latest_charge"]]);

// What the customer paid with, for the payment list: "Visa 4242", "Apple Pay", "Link"...
export function methodOf(s: Session): string {
  const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
  const ch = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const d = ch?.payment_method_details;
  if (!d?.type) return "Online (Stripe)";
  if (d.type === "card") { const w = d.card?.wallet?.type; const brand = (d.card?.brand ?? "card").replace(/^\w/, (c) => c.toUpperCase()); return `Online: ${w ? w.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " " : ""}${brand} ${d.card?.last4 ?? ""}`.trim().slice(0, 30); }
  return `Online: ${d.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`.slice(0, 30);
}
export const intentOf = (s: Session) => (typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id);

// Stripe-Signature: t=timestamp,v1=hmac. The signed text is `${t}.${raw body}`; five minutes of tolerance.
export function verifyWebhook(raw: string, header: string | null): { ok: true; event: { id: string; type: string; data: { object: Session } } } | { ok: false; error: string } {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return { ok: false, error: "STRIPE_WEBHOOK_SECRET is not set" };
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t), v1 = (header ?? "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !v1.length) return { ok: false, error: "no signature" };
  if (Math.abs(Date.now() / 1000 - t) > 300) return { ok: false, error: "signature too old" };
  const want = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  if (!v1.some((v) => v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)))) return { ok: false, error: "bad signature" };
  try { return { ok: true, event: JSON.parse(raw) }; } catch { return { ok: false, error: "bad body" }; }
}
