import { tryLoaded } from "@/lib/persist";
import { invoicePdf } from "@/lib/pdf";
import { wrOfToken } from "@/lib/paylink";

export const dynamic = "force-dynamic";

// The invoice as a PDF for the customer (the signed link is the key: no sign-in).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await tryLoaded();
  const w = wrOfToken((await params).token);
  if (!w?.invoice) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await invoicePdf(w)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Invoice-${w.invoice}.pdf"`, "cache-control": "private, no-store" } });
}
