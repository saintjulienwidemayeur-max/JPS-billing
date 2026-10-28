import { db } from "@/lib/wh-store";
import { tryLoaded } from "@/lib/persist";
import { paymentReceiptPdf } from "@/lib/pdf";
import { readPayToken } from "@/lib/paylink";

export const dynamic = "force-dynamic";

// The receipt of one payment on the invoice, as a PDF. The link (with its signature) is the key: no sign-in.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; i: string }> }) {
  await tryLoaded();
  const { token, i } = await params, inv = readPayToken(token), n = Number(i);
  const w = inv ? db.wrs.find((x) => x.invoice === inv) : undefined;
  if (!w || !Number.isInteger(n) || !w.payments[n]) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await paymentReceiptPdf(w, n)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Payment-receipt-${inv}-${n + 1}.pdf"`, "cache-control": "private, no-store" } });
}
