import type { NextRequest } from "next/server";
import { tryLoaded } from "@/lib/persist";
import { usToIso, isoToday } from "@/lib/clock";
import { allPayments } from "@/lib/paylist";

export const dynamic = "force-dynamic";
// Text that starts with = + - @ would run as a formula in Excel (a customer called "=HYPERLINK(...)"): a quote mark in front makes it plain text.
const q = (v: string | number | undefined) => `"${(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v)).replace(/"/g, '""')}"`;

// The payment log of a month (and location) as a CSV file.
export async function GET(req: NextRequest) {
  await tryLoaded();
  const month = req.nextUrl.searchParams.get("month") || isoToday().slice(0, 7), loc = req.nextUrl.searchParams.get("loc") || "";
  const rows = allPayments().filter((x) => usToIso(x.p.date).startsWith(month) && (!loc || x.loc === loc)).map((x) => [x.p.date, x.p.time ?? "", x.cust, x.customer, x.label, x.loc, x.p.method, x.p.ref, x.p.amount].map(q).join(","));
  const csv = "﻿" + ["date,time,customer_no,customer,for,location,method,reference,amount", ...rows].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payments-${month}.csv"` } });
}
