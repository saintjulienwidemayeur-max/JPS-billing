"use server";
import { redirect } from "next/navigation";
import { db, nowStr, charges, balance, money, wrCode, r2, findCustomer, newCustomer, repOf, timeNow, creditOf, custOf, newOrderId, orderBalance, orderTotal, ORDER_FEE_PCT, ORDER_STATUSES, type Order, type OrderStatus, remember as rememberName, billBalance, debtBalance, type Debt, type Expense , priced } from "./wh-store";
import { act } from "./act";
import { requireUser } from "./users";
import { queueMail, emailInvoice, emailOrder } from "./auto-mail";
import { waNowInvoice, waNowOrder, waFailed, waSay } from "./whatsapp";
import { invoicePdf, orderPdf } from "./pdf";
import { payUrl } from "./paylink";
import { usToIso, isoToUs } from "./clock";

// The billing app's actions: invoices, payments, credit and purchase orders. Every one goes through act(): loaded, signed in, logged, saved.
type F = FormData;
const s = (f: F, k: string) => String(f.get(k) ?? "").trim();
const num = (f: F, k: string) => Number(f.get(k));
const back = (path: string, q: Record<string, string> = {}): never => {
  const qs = new URLSearchParams(q).toString();
  return redirect(qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path); // the path may already have a query (payments?inv=...)
};
// After a payment or an invoice change: the invoice if there is one, else the customer's payment page.
const wrPath = (id: string) => { const w = db.wrs.find((x) => x.id === id); return w?.invoice ? `/payments?inv=${w.invoice}` : `/payments?c=${w?.cust ?? ""}`; };

// A double click on "Enter payment" sends the form twice: the same amount, method and reference for the same target within a few seconds is refused once.
const recent = ((globalThis as unknown as { __payDup?: Map<string, number> }).__payDup ??= new Map<string, number>());
const twice = (target: string, amount: number, method: string, ref: string) => {
  const key = `${target}|${amount}|${method.toLowerCase()}|${ref}`, now = Date.now();
  for (const [k, t] of recent) if (now - t > 10_000) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now); return false;
};
const DUP = "This exact payment was just entered: check the list before entering it again.";
export const createInvoice = act("createInvoice", async (f: F) => {
  const w = db.wrs.find((x) => x.id === s(f, "wr"));
  if (!w) return;
  if (w.estimate) back("/invoices/new", { err: `${wrCode(w)} is marked as an estimate. Untick "estimate" on the receipt (warehouse app) when the real weights are in, then invoice it.` });
  if (!w.pieces.length && charges(w) <= 0) back("/invoices/new", { err: "Add at least one piece or one fee to the receipt (in the warehouse app) before invoicing." });
  if (!w.invoice) { for (const p of w.pieces) { p.old ??= false; p.rd ??= 0; } /* this invoice is made with today's formulas: never switch it to the old ones */ w.invoice = `INV-${db.n.inv++}`; w.invoiceDate = nowStr(); queueMail(() => emailInvoice(w)); } // the invoice (PDF) is e-mailed by itself
  back(`/invoices/${w.invoice}`, { ok: `Invoice ${w.invoice} created.` });
});
// Bulk invoicing: every receipt of the list the clerk is looking at (ids from the page), each checked again here. Each invoice is e-mailed by itself, as one by one.
export const createInvoices = act("createInvoices", async (f: F) => {
  const ids = s(f, "ids").split(",").filter(Boolean).slice(0, 200);
  let made = 0, skipped = 0;
  for (const id of ids) {
    const w = db.wrs.find((x) => x.id === id);
    if (!w || w.invoice || w.estimate || !priced(w) || (!w.pieces.length && charges(w) <= 0)) { skipped++; continue; }
    for (const p of w.pieces) { p.old ??= false; p.rd ??= 0; }
    w.invoice = `INV-${db.n.inv++}`; w.invoiceDate = nowStr(); made++;
    queueMail(() => emailInvoice(w));
  }
  back("/invoices/new", { ok: `${made} invoice${made === 1 ? "" : "s"} made${skipped ? `, ${skipped} skipped` : ""}. Each one is e-mailed to its customer by itself (those with no usable e-mail are listed in Manage invoices).` });
});
export const addPayment = act("addPayment", async (f: F) => {
  const w = db.wrs.find((x) => x.id === s(f, "wr"));
  if (!w) return;
  const amount = num(f, "amount");
  if (!Number.isFinite(amount) || amount <= 0) back(wrPath(w.id), { err: "Enter a payment amount more than 0." });
  if (amount > balance(w) + 0.001) back(wrPath(w.id), { err: `That's more than the balance of ${money(balance(w))}.` });
  const method = s(f, "method");
  if (!method || method.length > 30) back(wrPath(w.id), { err: "Choose how the customer paid (or type a new payment method)." });
  const paid = r2(amount);
  if (twice(`wr${w.id}`, paid, method, s(f, "ref"))) back(wrPath(w.id), { err: DUP });
  w.payments.push({ date: nowStr(), time: timeNow(), amount: paid, method, ref: s(f, "ref") });
  rememberName(db.payMethods, method);
  back(wrPath(w.id), { ok: `Payment of ${money(paid)} by ${method} added. ${balance(w) > 0 ? `Balance left: ${money(balance(w))}.` : "Paid in full."}` });
});
// Bound from the page: voidPayment.bind(null, receiptId, paymentIndex).
export const voidPayment = act("voidPayment", async (wr: string, i: number) => {
  const w = db.wrs.find((x) => x.id === wr);
  if (!w || !w.payments[i]) return;
  const [p] = w.payments.splice(i, 1);
  const c = custOf(w);
  if (p.method === "Customer credit" && c) (c.creditLog ??= []).push({ date: nowStr(), time: timeNow(), amount: p.amount, note: `Returned: payment on ${wrCode(w)} voided` });
  back(w.invoice ? `/invoices/${encodeURIComponent(w.invoice)}` : wrPath(w.id), { ok: `Payment of ${money(p.amount)} (${p.method}) voided.` });
});

// ---------- Billing: customer payments, credit, invoice follow-up ----------
const PY = "/payments";
// A payment from a customer is spread over their receipts with a balance, oldest first; what is left stays as the customer's credit.
export const receivePayment = act("receivePayment", async (f: F) => {
  const c = db.customers.find((x) => x.no === num(f, "cust"));
  if (!c) back(PY, { err: "Choose the customer." });
  const here = `${PY}?c=${c!.no}`, amount = num(f, "amount"), method = s(f, "method"), ref = s(f, "ref");
  if (!Number.isFinite(amount) || amount <= 0) back(here, { err: "Enter the amount received (more than 0)." });
  if (amount > 1_000_000) back(here, { err: "That amount is more than $1,000,000: check it, or enter it in several payments." });
  if (!method || method.length > 30) back(here, { err: "Choose how the customer paid (or type a new payment method)." });
  if (twice(`c${c!.no}`, r2(amount), method, ref)) back(here, { err: DUP });
  const batch = `PAY-${db.n.pay++}`, date = nowStr(), time = timeNow();
  let left = r2(amount);
  // Receipts with a balance and the balances that are on no invoice (account balances): all paid oldest first.
  type Item = { date: string; id: string; w?: (typeof db.wrs)[number]; d?: Debt };
  const items: Item[] = [
    ...db.wrs.filter((w) => w.cust === c!.no && priced(w) && balance(w) > 0).map((w) => ({ date: w.date, id: w.id, w })),
    ...db.debts.filter((d) => d.cust === c!.no && debtBalance(d) > 0).map((d) => ({ date: d.date, id: d.id, d })),
  ].sort((a, b) => usToIso(a.date).localeCompare(usToIso(b.date)) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const it of items) {
    const take = Math.min(left, it.w ? balance(it.w) : debtBalance(it.d!));
    if (take <= 0) break;
    (it.w ?? it.d!).payments.push({ date, time, amount: r2(take), method, ref, batch });
    left = r2(left - take);
  }
  if (left > 0) (c!.creditLog ??= []).push({ date, time, amount: left, note: `Paid more than owed (${method})`, batch, method, ref });
  rememberName(db.payMethods, method);
  back(`${PY}/${batch}`);
});
export const applyCredit = act("applyCredit", async (wr: string) => {
  const w = db.wrs.find((x) => x.id === wr), c = w && custOf(w);
  if (!w || !c) return;
  const take = Math.min(creditOf(c), balance(w));
  if (take <= 0) back(wrPath(w.id), { err: "The customer has no credit, or this receipt has no balance." });
  w.payments.push({ date: nowStr(), time: timeNow(), amount: r2(take), method: "Customer credit", ref: "" });
  (c.creditLog ??= []).push({ date: nowStr(), time: timeNow(), amount: -r2(take), note: `Applied to ${wrCode(w)}` });
  back(wrPath(w.id), { ok: `${money(take)} of the customer's credit applied.` });
});
// Gives back money the customer left as credit (a refund): the credit goes down, and the refund is on the customer's account with how it was paid.
export const refundCredit = act("refundCredit", async (f: F) => {
  const c = db.customers.find((x) => x.no === num(f, "cust"));
  if (!c) back("/customers", { err: "Choose the customer." });
  const here = `/customers/${c!.no}`, amount = num(f, "amount"), method = s(f, "method");
  if (!Number.isFinite(amount) || amount <= 0) back(here, { err: "Enter the amount to give back (more than 0)." });
  if (amount > creditOf(c) + 0.001) back(here, { err: `The customer has only ${money(creditOf(c))} of credit.` });
  if (!method || method.length > 30) back(here, { err: "Say how the money was given back (cash, Zelle, check...)." });
  const paid = r2(Math.min(amount, creditOf(c)));
  (c!.creditLog ??= []).push({ date: nowStr(), time: timeNow(), amount: -paid, note: `Refunded by ${method}${s(f, "ref") ? ` (${s(f, "ref")})` : ""}`, method, ref: s(f, "ref") });
  rememberName(db.payMethods, method);
  back(here, { ok: `${money(paid)} of credit given back by ${method}.` });
});
export const markInvoiceSent = act("markInvoiceSent", async (wr: string) => {
  const w = db.wrs.find((x) => x.id === wr);
  if (w?.invoice) { w.invoiceSent = nowStr(); back(`/invoices/${w.invoice}`, { ok: "Marked as emailed." }); }
});
export const cancelInvoice = act("cancelInvoice", async (wr: string) => {
  const w = db.wrs.find((x) => x.id === wr);
  if (!w?.invoice) return;
  if (w.payments.length) back(`/invoices/${w.invoice}`, { err: "This invoice has payments. Void them first." });
  const no = w.invoice;
  w.invoice = undefined; w.invoiceDate = undefined; w.invoiceSent = undefined;
  back(`/invoices/new`, { q: String(w.id), ok: `Invoice ${no} cancelled: ${wrCode(w)} is waiting for an invoice again.` });
});

// ---------- Purchase orders ----------
const OR = "/orders";
const orderPath = (id: string) => `${OR}/${id}`;
const itemInput = (desc: string, qty: number, unit: number) => {
  if (!desc) return "Enter what is being bought.";
  if (desc.length > 120) return "The description is too long (120 characters max).";
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10000) return "Enter a quantity (more than 0).";
  if (!Number.isFinite(unit) || unit < 0 || unit > 1_000_000) return "Enter the unit cost (0 or more).";
  return "";
};
// Changing the lines or the fee changes what is owed: an order paid in full that now has a balance is "Invoiced" again, and the other way round.
const syncPaid = (o: Order) => { if (o.items.length && orderBalance(o) <= 0 && o.status === "Invoiced") o.status = "Paid"; else if (orderBalance(o) > 0 && o.status === "Paid") o.status = "Invoiced"; };
export const createOrder = act("createOrder", async (f: F) => {
  const name = s(f, "customer");
  if (!name) back(OR, { err: "Choose or enter the customer." });
  const c = findCustomer(name) ?? newCustomer(name);
  const o: Order = { id: newOrderId(), date: nowStr(), cust: c.no, customer: c.name, rep: c.rep, items: [], feePct: ORDER_FEE_PCT, notes: "", status: "Invoiced", tracking: "", payments: [] };
  db.orders.unshift(o);
  back(orderPath(o.id));
});
export const saveOrder = act("saveOrder", async (f: F) => {
  const o = db.orders.find((x) => x.id === s(f, "order"));
  if (!o) return;
  const pct = num(f, "feePct");
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) back(orderPath(o.id), { err: "The purchasing fee must be between 0 and 100 %." });
  const status = s(f, "status") as OrderStatus, was = o.status;
  Object.assign(o, { feePct: pct, notes: s(f, "notes"), tracking: s(f, "tracking"), rep: repOf(s(f, "rep")) ? s(f, "rep") : "", status: ORDER_STATUSES.includes(status) ? status : o.status });
  if (status === was) syncPaid(o); // the fee may have changed what is owed (not when the status was changed by hand)
  back(orderPath(o.id), { ok: "Order saved." });
});
export const addOrderItem = act("addOrderItem", async (f: F) => {
  const o = db.orders.find((x) => x.id === s(f, "order"));
  if (!o) return;
  const desc = s(f, "desc"), qty = num(f, "qty"), unit = num(f, "unit"), bad = itemInput(desc, qty, unit);
  if (bad) back(orderPath(o.id), { err: bad });
  o.items.push({ desc, qty, unit: r2(unit) });
  syncPaid(o);
  back(orderPath(o.id), { ok: `"${desc}" added.` });
});
export const saveOrderItems = act("saveOrderItems", async (f: F) => {
  const o = db.orders.find((x) => x.id === s(f, "order"));
  if (!o) return;
  const next = [];
  for (let i = 0; i < o.items.length; i++) {
    const desc = s(f, `d_${i}`), qty = num(f, `q_${i}`), unit = num(f, `u_${i}`), bad = itemInput(desc, qty, unit);
    if (bad) back(orderPath(o.id), { err: `Line ${i + 1}: ${bad}` });
    next.push({ desc, qty, unit: r2(unit) });
  }
  o.items = next;
  syncPaid(o);
  back(orderPath(o.id), { ok: "Lines saved." });
});
// Bound from the page: deleteOrderItem.bind(null, orderId, lineIndex).
export const deleteOrderItem = act("deleteOrderItem", async (id: string, i: number) => {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return;
  o.items.splice(i, 1);
  syncPaid(o);
  back(orderPath(o.id), { ok: "Line removed." });
});
export const addOrderPayment = act("addOrderPayment", async (f: F) => {
  const o = db.orders.find((x) => x.id === s(f, "order"));
  if (!o) return;
  const amount = num(f, "amount"), method = s(f, "method");
  if (!Number.isFinite(amount) || amount <= 0) back(orderPath(o.id), { err: "Enter a payment amount more than 0." });
  if (amount > orderBalance(o) + 0.001) back(orderPath(o.id), { err: `That's more than the balance of ${money(orderBalance(o))}.` });
  if (!method || method.length > 30) back(orderPath(o.id), { err: "Choose how the customer paid (or type a new payment method)." });
  if (twice(`o${o.id}`, r2(amount), method, s(f, "ref"))) back(orderPath(o.id), { err: DUP });
  o.payments.push({ date: nowStr(), time: timeNow(), amount: r2(amount), method, ref: s(f, "ref") });
  rememberName(db.payMethods, method);
  if (orderBalance(o) <= 0 && o.status === "Invoiced") o.status = "Paid";
  back(orderPath(o.id), { ok: `Payment of ${money(r2(amount))} by ${method} added. ${orderBalance(o) > 0 ? `Balance left: ${money(orderBalance(o))}.` : "Paid in full: JP's can buy the order."}` });
});
export const voidOrderPayment = act("voidOrderPayment", async (id: string, i: number) => {
  const o = db.orders.find((x) => x.id === id);
  if (!o || !o.payments[i]) return;
  const [p] = o.payments.splice(i, 1);
  if (orderBalance(o) > 0 && o.status === "Paid") o.status = "Invoiced";
  back(orderPath(o.id), { ok: `Payment of ${money(p.amount)} (${p.method}) voided.` });
});

// Scan a parcel on Consolidate: it is selected for consolidation, and if it was never received it is received right now.

// ---------- Payables: the bills JP's has to pay ----------
const PB = "/payables";
export const addBill = act("addBill", async (f: F) => {
  const vendor = s(f, "vendor"), amount = num(f, "amount");
  if (!vendor || vendor.length > 80) back(PB, { err: "Enter who the bill is from." });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) back(PB, { err: "Enter the amount of the bill (more than 0)." });
  const date = s(f, "date") ? isoToUs(s(f, "date")) : nowStr(), due = s(f, "due") ? isoToUs(s(f, "due")) : date;
  db.payables.unshift({ id: `B-${db.n.bill++}`, vendor, ref: s(f, "ref"), date, due, amount: r2(amount), category: s(f, "category") || "Other", notes: s(f, "notes"), payments: [], ...(s(f, "shipment") && db.shipments.some((x) => x.name === s(f, "shipment")) && { shipment: s(f, "shipment") }) });
  back(PB, { ok: `Bill from ${vendor} added.` });
});
export const payBill = act("payBill", async (f: F) => {
  const b = db.payables.find((x) => x.id === s(f, "id"));
  if (!b) return;
  const amount = num(f, "amount"), method = s(f, "method");
  if (!Number.isFinite(amount) || amount <= 0) back(PB, { err: "Enter the amount paid (more than 0)." });
  if (amount > billBalance(b) + 0.001) back(PB, { err: `That's more than the balance of ${money(billBalance(b))}.` });
  if (!method || method.length > 30) back(PB, { err: "Enter how it was paid." });
  if (twice(`b${b.id}`, r2(amount), method, s(f, "ref"))) back(PB, { err: DUP });
  b.payments.push({ date: nowStr(), time: timeNow(), amount: r2(amount), method, ref: s(f, "ref") });
  rememberName(db.payMethods, method);
  back(PB, { ok: `Paid ${money(r2(amount))} to ${b.vendor}.` });
});
export const deleteBill = act("deleteBill", async (id: string) => {
  const b = db.payables.find((x) => x.id === id);
  if (!b) return;
  if (b.payments.length) back(PB, { err: "This bill has payments: it cannot be deleted." });
  db.payables = db.payables.filter((x) => x !== b);
  back(PB, { ok: "Bill deleted." });
});

// "Notify by e-mail" button: the invoice (PDF) goes to the customer now, even if it was already sent.
export const notifyInvoiceEmail = act("notifyInvoiceEmail", async (wr: string) => {
  const w = db.wrs.find((x) => x.id === wr);
  if (!w?.invoice) return;
  const to = `/invoices/${encodeURIComponent(w.invoice)}`;
  // ONE button: the e-mail (PDF) and the WhatsApp message go together.
  const err = await emailInvoice(w, true), waErr = await waNowInvoice(w, balance(w), async () => ({ name: `Invoice-${w.invoice}.pdf`, bytes: await invoicePdf(w) }), payUrl(w.invoice));
  if (err && waFailed(waErr)) back(to, { err: `Nothing was sent. E-mail: ${err}. WhatsApp: ${waErr}.` });
  back(to, { ok: `${err ? `E-mail NOT sent (${err})` : "E-mail sent"}. ${waSay(waErr)}` });
});

// ---------- Expenses: for a cargo (shipment) or the small everyday ones ----------
const EX = "/expenses";
export const addExpense = act("addExpense", async (f: F) => {
  const who = (await requireUser()).name, amount = num(f, "amount"), shipment = s(f, "shipment"), category = s(f, "category");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) back(EX, { err: "Enter the amount (more than 0)." });
  if (!category || category.length > 40) back(EX, { err: "Choose what it was for (category)." });
  if (shipment && !db.shipments.some((x) => x.name === shipment)) back(EX, { err: "That cargo does not exist." });
  const date = s(f, "date") ? isoToUs(s(f, "date")) : nowStr();
  const e: Expense = { id: `X${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, date, amount: r2(amount), category, payee: s(f, "payee").slice(0, 80), method: s(f, "method").slice(0, 30), notes: s(f, "notes").slice(0, 200), by: who ?? "", ...(shipment && { shipment }) };
  db.expenses.unshift(e);
  if (e.method) rememberName(db.payMethods, e.method);
  back(EX, { ok: `Expense of ${money(e.amount)} saved${shipment ? ` for cargo ${shipment}` : " (everyday)"}.`, ...(shipment && { view: shipment }) });
});
export const deleteExpense = act("deleteExpense", async (id: string) => {
  const before = db.expenses.length;
  db.expenses = db.expenses.filter((x) => x.id !== id);
  back(EX, { ok: before > db.expenses.length ? "Expense deleted." : "Already deleted." });
});

// ---------- Account balance: what a customer owes that is on no invoice ----------
export const addDebt = act("addDebt", async (f: F) => {
  const c = db.customers.find((x) => x.no === num(f, "cust"));
  if (!c) back("/customers", { err: "Choose the customer." });
  const here = `/customers/${c!.no}`, amount = num(f, "amount"), note = s(f, "note");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) back(here, { err: "Enter the amount owed (more than 0)." });
  if (!note || note.length > 120) back(here, { err: "Say what it is for (a few words)." });
  const id = `D-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();
  db.debts.unshift({ id, cust: c!.no, customer: c!.name, rep: c!.rep, date: s(f, "date") ? isoToUs(s(f, "date")) : nowStr(), amount: r2(amount), note, payments: [] });
  back(here, { ok: `Account balance of ${money(r2(amount))} added.` });
});
export const payDebt = act("payDebt", async (f: F) => {
  const d = db.debts.find((x) => x.id === s(f, "id"));
  if (!d) return;
  const here = `/customers/${d.cust}`, amount = num(f, "amount"), method = s(f, "method");
  if (!Number.isFinite(amount) || amount <= 0) back(here, { err: "Enter the amount paid (more than 0)." });
  if (amount > debtBalance(d) + 0.001) back(here, { err: `That is more than the balance of ${money(debtBalance(d))}.` });
  if (!method || method.length > 30) back(here, { err: "Choose how the customer paid (or type a new payment method)." });
  if (twice(`d${d.id}`, r2(amount), method, s(f, "ref"))) back(here, { err: DUP });
  const batch = `PAY-${db.n.pay++}`;
  d.payments.push({ date: nowStr(), time: timeNow(), amount: r2(amount), method, ref: s(f, "ref"), batch });
  rememberName(db.payMethods, method);
  back(`${PY}/${batch}`);
});
export const deleteDebt = act("deleteDebt", async (id: string) => {
  const d = db.debts.find((x) => x.id === id);
  if (!d) return;
  if (d.payments.length) back(`/customers/${d.cust}`, { err: "This balance has payments: it cannot be deleted." });
  db.debts = db.debts.filter((x) => x !== d);
  back(`/customers/${d.cust}`, { ok: "Account balance deleted." });
});

// "Notify by e-mail" on an order: the order's invoice (PDF) goes to the customer now.
export const notifyOrderEmail = act("notifyOrderEmail", async (id: string) => {
  const o = db.orders.find((x) => x.id === id);
  if (!o) return;
  const to = `/orders/${o.id}`;
  if (!o.items.length) back(to, { err: "Add at least one item before e-mailing the order." });
  const err = await emailOrder(o), waErr = await waNowOrder(db.customers.find((x) => x.no === o.cust), o.id, money(orderTotal(o)), money(Math.max(0, orderBalance(o))), async () => ({ name: `Order-${o.id}.pdf`, bytes: await orderPdf(o) }));
  if (err && waFailed(waErr)) back(to, { err: `Nothing was sent. E-mail: ${err}. WhatsApp: ${waErr}.` });
  back(to, { ok: `${err ? `E-mail NOT sent (${err})` : "E-mail sent"}. ${waSay(waErr)}` });
});
