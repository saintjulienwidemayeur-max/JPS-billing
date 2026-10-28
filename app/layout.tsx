import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa";
import { connection } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { Crumbs } from "@/components/crumbs";
import { menuBadges } from "@/lib/badges";
import { currentUser } from "@/lib/users";
import { db } from "@/lib/wh-store";
import { VERSION } from "@/lib/version";
import { persistState, initStore, refresh } from "@/lib/persist";
import { retryInvoiceMails } from "@/lib/auto-mail";
import { syncSiteReceiptsSoon } from "@/lib/site-receipts";

export const metadata: Metadata = {
  title: "JP's Billing", applicationName: "JP's Billing",
  appleWebApp: { capable: true, title: "JP's Billing", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#20338f", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection(); // the banner reflects the database state at request time
  const wasDown = persistState().enabled && !persistState().loaded;
  if (wasDown) await initStore(); // retry if the database was down at start
  await refresh(); // what the other app (billing) saved
  const ps = persistState();
  if (ps.loaded) { retryInvoiceMails(); syncSiteReceiptsSoon(); }
  const reconnected = wasDown && ps.loaded; // this page was drawn from an empty copy: reload it
  const path = (await headers()).get("x-pathname") ?? "/";
  const open = path === "/login" || path.startsWith("/pay/"); // the login page and the pay pages (the customer's link) need no sign-in
  const user = open ? null : await currentUser();
  if (!open && !user) redirect("/login"); // cookie of someone removed or changed, or a restart
  const mode = !ps.enabled ? "memory" : ps.loaded ? "database" : "down";
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {reconnected && <meta httpEquiv="refresh" content="1" />}
        {reconnected && <div role="status" className="no-print bg-green-700 px-4 py-2 text-center text-sm font-medium text-white">The database is back. Reloading…</div>}
        {(mode === "down" || (mode === "database" && ps.error)) && (
          <div role="alert" className="no-print bg-red-700 px-4 py-2 text-center text-sm font-medium text-white">
            {mode === "down" ? "The database is not reachable: nothing can be saved right now." : "The last save to the database failed. It will be retried with the next change."}
          </div>
        )}
        <div className="flex min-h-screen flex-col md:flex-row"><Nav mode={mode} user={user ? { name: user.name, admin: user.admin, perms: user.perms } : null} badges={user ? menuBadges() : {}} version={VERSION} /><div className="min-w-0 flex-1"><Crumbs />{user?.admin && db.users.some((u) => u.defaultCode && u.active) && <div role="status" className="no-print bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">The administrator still has the default code. <a href="/account" className="underline">Change it now</a>.</div>}{children}</div></div>
      </body>
    </html>
  );
}
