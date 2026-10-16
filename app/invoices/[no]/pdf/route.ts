import { db } from "@/lib/wh-store";
import { tryLoaded } from "@/lib/persist";
import { invoicePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

// The invoice as a PDF, made now from the invoice as it is.
export async function GET(_req: Request, { params }: { params: Promise<{ no: string }> }) {
  await tryLoaded();
  const no = decodeURIComponent((await params).no);
  const w = db.wrs.find((x) => x.invoice === no);
  if (!w) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await invoicePdf(w)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Invoice-${no}.pdf"` } });
}
