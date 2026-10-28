// The link a customer opens to pay an invoice online. It carries the invoice number and a signature, so it cannot be guessed or changed:
// no sign-in is needed. Server only.
import crypto from "node:crypto";

const secret = () => process.env.PAY_LINK_SECRET || process.env.AUTH_SECRET || "jps-dev-pay-link";
const sig = (inv: string) => crypto.createHmac("sha256", secret()).update(`pay:${inv}`).digest("hex").slice(0, 24);
export const payToken = (inv: string) => `${Buffer.from(inv).toString("base64url")}.${sig(inv)}`;
export function readPayToken(token: string): string | null {
  const [a, b] = decodeURIComponent(token).split(".");
  if (!a || !b) return null;
  let inv = ""; try { inv = Buffer.from(a, "base64url").toString(); } catch { return null; }
  const want = sig(inv);
  return inv && b.length === want.length && crypto.timingSafeEqual(Buffer.from(b), Buffer.from(want)) ? inv : null;
}
// The public address of this app (PAY_BASE_URL, else the one Render gives). Empty when unknown: then no link is put in e-mails.
export const payBase = (fallback = "") => (process.env.PAY_BASE_URL || process.env.RENDER_EXTERNAL_URL || fallback).replace(/\/$/, "");
export const payUrl = (inv: string | undefined, fallback = "") => (inv && payBase(fallback) ? `${payBase(fallback)}/pay/${payToken(inv)}` : "");
export const receiptUrl = (inv: string, i: number, fallback = "") => (payBase(fallback) ? `${payBase(fallback)}/pay/${payToken(inv)}/receipt/${i}` : "");
export const OWNER_ALERT = (process.env.PAYMENT_ALERT_EMAIL || "jpslogisticsmiami@gmail.com").trim();
