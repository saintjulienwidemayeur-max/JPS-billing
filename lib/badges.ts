// Small counters shown next to menu entries (what is waiting for someone). Server only: reads the working copy.
import { db, balance, orderBalance, billBalance } from "./wh-store";

export type Badges = Record<string, number>;
export function menuBadges(): Badges {
  return {
    "/invoices": db.wrs.filter((w) => w.invoice && balance(w) > 0).length,
    "/orders": db.orders.filter((o) => orderBalance(o) > 0).length,
    "/payables": db.payables.filter((b) => billBalance(b) > 0).length,
  };
}
export const owed = () => Math.round(db.wrs.filter((w) => w.invoice).reduce((a, w) => a + Math.max(0, balance(w)), 0) * 100) / 100;
