// A link to a page of the warehouse app (receipts, shipments...). The billing app is a separate site: set WAREHOUSE_URL to the warehouse app's
// address and these become links; without it they are plain text.
import type { ReactNode } from "react";

export const WAREHOUSE_URL = (process.env.WAREHOUSE_URL ?? "").replace(/\/$/, "");
export function WhLink({ path, className, children }: { path: string; className?: string; children: ReactNode }) {
  return WAREHOUSE_URL ? <a href={WAREHOUSE_URL + path} className={className}>{children}</a> : <span>{children}</span>;
}
