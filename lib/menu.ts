// The billing app's menu: sections like the old billing software (customers, receivables, reports, payables). The sidebar, the main menu, each
// section's page and the breadcrumb all read this list, so a page is added in one place.
import { allowed, isOn, type Claims } from "./access";
import { Home, Users, FileText, FilePlus2, Banknote, Archive, ShoppingCart, Wallet, CalendarDays, ScrollText, Receipt, FileUp, Landmark, Coins, Ship, Warehouse, type LucideIcon } from "lucide-react";

export type MenuPage = { href: string; label: string; icon: LucideIcon; desc: string; adminOnly?: boolean };
export type MenuSection = { slug: string; title: string; icon: LucideIcon; blurb: string; pages: MenuPage[] };

export const HOME = { href: "/", label: "Main menu", icon: Home };

export const SECTIONS: MenuSection[] = [
  {
    slug: "customers", title: "Customers", icon: Users, blurb: "View a customer: invoices, payments and balance",
    pages: [
      { href: "/customers", label: "View customer", icon: Users, desc: "Find a customer: what they owe, their invoices and payments, their statement" },
    ],
  },
  {
    slug: "receivables", title: "Receivables", icon: Wallet, blurb: "Invoices and the payments received",
    pages: [
      { href: "/receivables", label: "Receivables", icon: Wallet, desc: "What is owed, how old it is, and who owes" },
      { href: "/invoices", label: "Manage invoices", icon: FileText, desc: "Every invoice: filter, print, follow up" },
      { href: "/invoices/new", label: "Invoice", icon: FilePlus2, desc: "Make the invoice of a warehouse receipt" },
      { href: "/payments", label: "Enter payments", icon: Banknote, desc: "Receive a payment from a customer, or pay one invoice" },
      { href: "/oldinvoices", label: "Old invoices", icon: Archive, desc: "The invoices of the old billing system: history and what is still owed" },
      { href: "/orders", label: "Orders", icon: ShoppingCart, desc: "Purchase orders JP's buys for customers" },
    ],
  },
  {
    slug: "reports", title: "Reports", icon: ScrollText, blurb: "Payment reports to print",
    pages: [
      { href: "/reports/daily", label: "Daily payment report", icon: CalendarDays, desc: "Everything received on one day, by method" },
      { href: "/reports/payment-log", label: "Payment log report", icon: ScrollText, desc: "The payments of a month or a period, by location" },
      { href: "/reports/shipments", label: "Shipments report", icon: Ship, desc: "What each shipment billed, was paid and is still owed" },
      { href: "/reports/storage", label: "Storage (30+ days)", icon: Warehouse, desc: "Receipts waiting more than 30 days: the storage fee of the terms" },
    ],
  },
  {
    slug: "payables", title: "Payables", icon: Landmark, blurb: "What JP's has to pay",
    pages: [
      { href: "/payables", label: "Bills to pay", icon: Receipt, desc: "Suppliers' bills: what is due, pay and follow up" },
      { href: "/expenses", label: "Expenses", icon: Coins, desc: "What JP's spent: by cargo (shipment) and the small everyday expenses" },
    ],
  },
  {
    slug: "admin", title: "Administration", icon: FileUp, blurb: "Bring in the old system's data",
    pages: [
      { href: "/import", label: "Import old invoices", icon: FileUp, desc: "Bring the invoices and payments of the old system in from CSV files", adminOnly: true },
    ],
  },
];

const on = isOn;
// The section and page a path belongs to (the hub page /menu/<slug> belongs to its section, with no page). The longest matching href wins.
export function locate(path: string): { section?: MenuSection; page?: MenuPage } {
  const hub = path.match(/^\/menu\/([^/]+)/);
  if (hub) return { section: SECTIONS.find((s) => s.slug === hub[1]) };
  let best: { section: MenuSection; page: MenuPage } | undefined;
  for (const section of SECTIONS) for (const page of section.pages) if (on(path, page.href) && (!best || page.href.length > best.page.href.length)) best = { section, page };
  return best ?? {};
}
export { isOn };
export const visibleSections = (c: Pick<Claims, "admin" | "perms">): MenuSection[] =>
  SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => allowed(c, p.href)) })).filter((s) => s.pages.length > 0);
// Pages are not granted one by one here: a user gets the whole billing system (the "/billing" access, given in the warehouse app's Users & access).
export const grantable = (): { slug: string; title: string; pages: { href: string; label: string }[] }[] => [];
