import { tryLoaded } from "@/lib/persist";
import { receiptPdf } from "@/lib/pdf";
import { wrOfToken } from "@/lib/paylink";
import { wrCode } from "@/lib/wh-store";

export const dynamic = "force-dynamic";

// The warehouse receipt as a PDF for the customer (the signed link is the key: no sign-in).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await tryLoaded();
  const w = wrOfToken((await params).token);
  if (!w) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await receiptPdf(w)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Receipt-${wrCode(w)}.pdf"`, "cache-control": "private, no-store" } });
}
