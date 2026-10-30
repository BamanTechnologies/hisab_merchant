import { buildStockDescriptor, formatProductTypeLabel } from "$lib/stockLabel";
import {
  businessFromMerchant,
  createPdfDoc,
  merchantFullName,
  pdfDate,
  pdfMoney,
  pdfNumber,
  pdfQuantity,
  pdfText,
  statusLabel,
  statusTone,
  type PdfMerchantInfo,
} from "./kit";

/** Snapshot saved in `reports.meta` when the report was sent. */
export type ReportMeta = {
  stocks?: Array<{
    id: string;
    type?: string | null;
    product_type?: string | null;
    attributes?: Record<string, unknown> | string | null;
    model_number?: string | null;
    country?: string | null;
    thickness?: number | string | null;
    color?: string | null;
    figure?: string | null;
    quantity?: number | string | null;
    selling_price?: number | string | null;
  }> | null;
  orders?: Array<{
    id: string;
    stock_name?: string | null;
    order_quantity?: number | string | null;
    total_amount?: number | string | null;
    selling_price?: number | string | null;
    unit_price?: number | string | null;
    created_at?: string | null;
    customer_name?: string | null;
    status?: string | null;
  }> | null;
  payments?: Array<{
    id: string;
    amount?: number | string | null;
    payment_method?: string | null;
    created_at?: string | null;
    customer_name?: string | null;
  }> | null;
  orders_aggregate?: { aggregate?: { sum?: { total_amount?: number | string | null } } } | null;
  payments_aggregate?: { aggregate?: { sum?: { amount?: number | string | null } } } | null;
  investor_by_pk?: { first_name?: string | null; phone_number?: string | null } | null;
};

export type InvestorReportInput = {
  id: string;
  createdAt: string;
  previousReportAt: string | null;
  investorPhone: string;
  investor: { first_name?: string | null; last_name?: string | null; phone_number?: string | null } | null;
  smsStatus: string | null;
  message: string | null;
  meta: ReportMeta | null;
  merchant: PdfMerchantInfo | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stockAttributes(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function stockTypeName(s: NonNullable<ReportMeta["stocks"]>[number]): string {
  // `product_type` may hold a uuid reference, which is meaningless to a reader.
  const t = [s.type, s.product_type].map((v) => String(v ?? "").trim()).find((v) => v && !UUID_RE.test(v));
  return t ?? "";
}

export async function buildInvestorReportPdf(input: InvestorReportInput) {
  const number = `RPT-${input.id.slice(0, 8).toUpperCase()}`;
  const doc = await createPdfDoc({ title: `Investor statement ${number}`, subject: "Investor statement" });
  const meta = input.meta;

  const investorName =
    [input.investor?.first_name ?? meta?.investor_by_pk?.first_name, input.investor?.last_name]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .join(" ") || "Investor";
  const investorPhone = input.investor?.phone_number || input.investorPhone;
  const period = input.previousReportAt
    ? `${pdfDate(input.previousReportAt)} – ${pdfDate(input.createdAt)}`
    : `Up to ${pdfDate(input.createdAt)}`;

  doc.letterhead(businessFromMerchant(input.merchant), {
    title: "Investor statement",
    number,
    rows: [
      ["Period", period],
      ["Report date", pdfDate(input.createdAt, true)],
    ],
    ...(input.smsStatus
      ? { badge: { text: `SMS ${statusLabel(input.smsStatus)}`, tone: statusTone(input.smsStatus) } }
      : {}),
  });

  const merchantName = merchantFullName(input.merchant);
  doc.infoCards([
    {
      label: "Prepared for",
      lines: [
        { text: investorName, bold: true },
        ...(investorPhone ? [{ text: `Tel: ${investorPhone}` }] : []),
      ],
    },
    {
      label: "Prepared by",
      lines: [
        { text: merchantName || "Merchant", bold: true },
        ...(input.merchant?.phone_number ? [{ text: `Tel: ${input.merchant.phone_number}` }] : []),
      ],
    },
  ]);

  if (!meta) {
    // Reports saved before `meta` existed only have the SMS text.
    doc.sectionTitle("Report");
    doc.paragraph(input.message?.trim() || "No report details were saved for this report.");
    doc.finish(`${number} · ${investorName}`);
    return { pdf: doc.pdf, fileName: `investor-statement-${input.id.slice(0, 8)}.pdf` };
  }

  const orders = meta.orders ?? [];
  const payments = meta.payments ?? [];
  const stocks = (meta.stocks ?? []).map((s) => {
    const attributes = stockAttributes(s.attributes);
    const type = stockTypeName(s);
    return {
      name: buildStockDescriptor({ ...s, type, attributes }),
      type: type ? formatProductTypeLabel(type) : "—",
      quantity: pdfNumber(s.quantity),
      price: s.selling_price,
    };
  });

  const salesTotal = orders.length
    ? orders.reduce((sum, o) => sum + pdfNumber(o.total_amount), 0)
    : pdfNumber(meta.orders_aggregate?.aggregate?.sum?.total_amount);
  const paymentsTotal = payments.length
    ? payments.reduce((sum, p) => sum + pdfNumber(p.amount), 0)
    : pdfNumber(meta.payments_aggregate?.aggregate?.sum?.amount);
  const balance = salesTotal - paymentsTotal;
  const orderCount = new Set(orders.map((o) => o.id)).size;
  const unitsInStock = stocks.reduce((sum, s) => sum + s.quantity, 0);
  const outOfStock = stocks.filter((s) => s.quantity <= 0).length;

  doc.kpis([
    {
      label: "Total sales",
      value: pdfMoney(salesTotal),
      sub: `${orderCount} ${orderCount === 1 ? "order" : "orders"} · ${orders.length} lines`,
    },
    {
      label: "Payments",
      value: pdfMoney(paymentsTotal),
      sub: `${payments.length} ${payments.length === 1 ? "payment" : "payments"}`,
      tone: "success",
    },
    {
      label: "Balance left",
      value: pdfMoney(balance),
      sub: balance < 0 ? "Payments exceed sales" : "Sales minus payments",
      tone: balance > 0 ? "warning" : "success",
    },
    {
      label: "Units in stock",
      value: pdfQuantity(unitsInStock),
      sub: `${stocks.length} items · ${outOfStock} out of stock`,
    },
  ]);

  doc.sectionTitle("Sales", `${orders.length} ${orders.length === 1 ? "line" : "lines"}`);
  doc.table(
    [
      { header: "Date", width: 20 },
      { header: "Customer", width: 24 },
      { header: "Item", width: 40 },
      { header: "Qty", width: 8, align: "right" },
      { header: "Unit price", width: 25, align: "right" },
      { header: "Amount", width: 26, align: "right" },
      { header: "Status", width: 19 },
    ],
    [...orders]
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
      .map((o) => [
        pdfDate(o.created_at),
        pdfText(o.customer_name),
        pdfText(o.stock_name),
        pdfQuantity(o.order_quantity),
        pdfMoney(o.unit_price ?? o.selling_price),
        { text: pdfMoney(o.total_amount), bold: true },
        o.status ? { text: statusLabel(o.status, true), tone: statusTone(o.status) } : "—",
      ]),
    {
      empty: "No sales in this period",
      ...(orders.length ? { footer: ["", "", "Total sales", "", "", pdfMoney(salesTotal), ""] } : {}),
    },
  );

  doc.sectionTitle("Payments", `${payments.length} ${payments.length === 1 ? "payment" : "payments"}`);
  doc.table(
    [
      { header: "Date", width: 28 },
      { header: "Customer", width: 40 },
      { header: "Method", width: 52 },
      { header: "Amount", width: 28, align: "right" },
    ],
    [...payments]
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
      .map((p) => [
        pdfDate(p.created_at, true),
        pdfText(p.customer_name),
        pdfText(p.payment_method),
        { text: pdfMoney(p.amount), bold: true },
      ]),
    {
      empty: "No payments in this period",
      ...(payments.length ? { footer: ["", "", "Total payments", pdfMoney(paymentsTotal)] } : {}),
    },
  );

  doc.totals([
    { label: "Total sales", value: pdfMoney(salesTotal) },
    { label: "Total payments", value: pdfMoney(paymentsTotal), tone: "success" },
    { label: "Balance left", value: pdfMoney(balance), emphasis: true },
  ]);

  doc.sectionTitle("Stock on hand", `${stocks.length} items · ${pdfQuantity(unitsInStock)} units`);
  doc.table(
    [
      { header: "#", width: 8 },
      { header: "Item", width: 62 },
      { header: "Type", width: 26 },
      { header: "Selling price", width: 26, align: "right" },
      { header: "Qty", width: 18, align: "right" },
    ],
    [...stocks]
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .map((s, i) => [
        String(i + 1),
        s.name,
        s.type,
        pdfMoney(s.price),
        s.quantity > 0 ? { text: pdfQuantity(s.quantity), bold: true } : { text: "Out", tone: "danger" as const },
      ]),
    {
      empty: "No stock assigned to this investor",
      ...(stocks.length ? { footer: ["", "Total units", "", "", pdfQuantity(unitsInStock)] } : {}),
    },
  );

  doc.finish(`${number} · ${investorName}`);
  return { pdf: doc.pdf, fileName: `investor-statement-${input.id.slice(0, 8)}.pdf` };
}
