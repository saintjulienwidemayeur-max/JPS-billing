"use server";
import { redirect } from "next/navigation";
import { ensureLoaded, flush } from "./persist";
import { requireAdmin } from "./users";
import { logAudit } from "./audit";
import { decodeCsv } from "./csv";
import { readBilling } from "./billing-import";
import { db } from "./wh-store";

const PAGE = "/import";
const MAX_BYTES = 8 * 1024 * 1024;
const to = (q: Record<string, string>) => `${PAGE}?${new URLSearchParams(q)}`;

// The old invoices: 4 CSV files, "Check" (saves nothing) or "Import" (replaces the old invoices already here). Administrators only.
export async function importOldBilling(f: FormData) {
  await ensureLoaded();
  const admin = await requireAdmin();
  const dry = f.get("mode") !== "import";
  const run = async (): Promise<string> => {
    const text = async (k: string) => { const x = f.get(k); return x instanceof File && x.size > 0 ? decodeCsv(await x.arrayBuffer()) : null; };
    const [invoices, lines, payments, apps] = [await text("invoices"), await text("lines"), await text("payments"), await text("apps")];
    if (!invoices || !lines || !payments || !apps) return to({ berr: "Choose the 4 files: invoices, invoice lines, payments and payment applications." });
    const { list, result, error } = readBilling({ invoices, lines, payments, apps });
    if (error) return to({ berr: error });
    if (!dry) db.oldInvoices = list;
    logAudit(admin.name, dry ? "check old invoices" : "import old invoices", `${result.invoices} invoices, ${result.payments} payments`, `${result.open} open, $${result.owed} owed`);
    return to({ bdone: dry ? "check" : "import", bi: String(result.invoices), bl: String(result.lines), bp: String(result.payments), bo: String(result.open), bw: String(result.owed), bu: String(result.unknownCustomers), bx: result.problems.join(" | ") });
  };
  let target: string;
  try { target = await run(); } catch (e) { target = to({ berr: `The files could not be read: ${e instanceof Error ? e.message : e}` }); }
  await flush();
  redirect(target);
}
