# JP's Logistics & More: billing system

The billing side of JP's, kept apart from the warehouse app (`app-adm-JPS`) as the old Access software was: it has its own site, its own menu and its own sign-in, but the **same database**, so everything the warehouse app records (customers, receipts, fees) is here, and everything done here (invoices, payments) shows up there.

    yarn install
    yarn dev   # http://localhost:3000

## What is in it (the old billing software's menus)
- **Customers > View customer**: search a customer; what they owe, invoices, payments, credit, statement (`/customers`).
- **Receivables**: overview (how old the balances are, who owes), **Manage invoices**, **Invoice** (make the invoice of a warehouse receipt), **Enter payments** (a payment from a customer spread over their invoices, or pay one invoice), **Old invoices** (history imported from the old system), **Orders** (purchase orders JP's buys for customers).
- **Reports**: **Daily payment report** (one day, by method) and **Payment log report** (a month, by location = the receipt's destination), both printable.
- **Payables > Bills to pay**: suppliers' bills (airline, shipping line, customs, rent, salaries...): due dates, late ones, record each payment.
- **Administration > Import old invoices**: the 4 CSV files of the old system (administrators only).

## How the two apps stay connected
Both apps keep a working copy in memory and save every change to the same Postgres (`DATABASE_URL`). On every request each app calls `refresh()` (`lib/persist.ts`): it brings in the rows the other app changed (a row you changed and have not saved yet is kept, counters take the larger value so the two apps never give out the same number). Deploy both apps with the **same `DATABASE_URL`**. Changes of the other app show up within a few seconds.

## Sign-in
The people and codes are the warehouse app's (table `wh_users`): same name and code here. An administrator opens everything; a limited user needs the **Billing system (separate app): may sign in** box ticked (warehouse app > Administration > Users & access). Set `AUTH_SECRET`.

## Deploy on Render
New Web Service from this repo: Build `yarn install && yarn build`, Start `yarn start`. Environment: `DATABASE_URL` (the same as the warehouse app), `AUTH_SECRET`, `WAREHOUSE_URL` (address of the warehouse app).

## Without a database
With no `DATABASE_URL` everything lives in memory and resets when the server restarts (only for trying it out).

## PWA
The app installs like an app (Chrome/Edge: "Install the app" in the menu; phone: Add to Home Screen): `app/manifest.ts`, `public/sw.js` (keeps only static files, never pages or data), `public/offline.html`, icons in `public/icons/`.
