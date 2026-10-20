import { db } from "@/lib/wh-store";
import { tryLoaded } from "@/lib/persist";
import { orderPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

// The order's invoice as a PDF, made now from the order as it is.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await tryLoaded();
  const id = decodeURIComponent((await params).id);
  const o = db.orders.find((x) => x.id === id);
  if (!o) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await orderPdf(o)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Order-${id}.pdf"` } });
}
