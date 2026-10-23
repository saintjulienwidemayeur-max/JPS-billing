import type { NextRequest } from "next/server";
import { tryLoaded } from "@/lib/persist";
import { usToIso, isoToday } from "@/lib/clock";
import { allPayments } from "@/lib/paylist";

export const dynamic = "force-dynamic";
const q = (v: string | number | undefined) => `"${String(v).replace(/"/g, '""')}"`;

// The payments of one day as a CSV file (the daily payment report).
export async function GET(req: NextRequest) {
  await tryLoaded();
  const day = req.nextUrl.searchParams.get("day") || isoToday();
  const rows = allPayments().filter((x) => usToIso(x.p.date) === day).map((x) => [x.p.date, x.p.time ?? "", x.cust, x.customer, x.label, x.p.method, x.p.ref, x.p.amount].map(q).join(","));
  const csv = "﻿" + ["date,time,customer_no,customer,for,method,reference,amount", ...rows].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payments-${day}.csv"` } });
}
