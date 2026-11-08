import { invoiceReportPdf } from "@/lib/pdf";
import { invoiceRows } from "@/lib/invoice-report";
import { tryLoaded } from "@/lib/persist";

export const dynamic = "force-dynamic";
// The invoice report as a PDF (same filters as the Invoices page). Signed-in people only (the middleware checks the cookie).
export async function GET(req: Request) {
  await tryLoaded();
  const q = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const rows = invoiceRows(q), what = [q.ship && `Ship: ${q.ship}`, q.status && `Status: ${q.status}`, q.customer && `Customer: ${q.customer}`].filter(Boolean).join("  |  ");
  return new Response(Buffer.from(await invoiceReportPdf(rows, what)), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Invoice-report.pdf"' } });
}
