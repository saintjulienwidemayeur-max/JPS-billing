import { tryLoaded } from "@/lib/persist";
import { paymentReceiptPdf } from "@/lib/pdf";
import { wrOfToken } from "@/lib/paylink";

export const dynamic = "force-dynamic";

// The receipt of one payment on the invoice, as a PDF. The link (with its signature) is the key: no sign-in.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; i: string }> }) {
  await tryLoaded();
  const { token, i } = await params, n = Number(i), w = wrOfToken(token);
  if (!w || !Number.isInteger(n) || !w.payments[n]) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await paymentReceiptPdf(w, n)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Payment-receipt-${w.invoice ?? w.id}-${n + 1}.pdf"`, "cache-control": "private, no-store" } });
}
