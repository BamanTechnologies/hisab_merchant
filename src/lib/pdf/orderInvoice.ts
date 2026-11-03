import {
  businessFromMerchant,
  createPdfDoc,
  pdfDate,
  pdfMoney,
  pdfNumber,
  pdfText,
  statusLabel,
  statusTone,
  type PdfMerchantInfo,
} from "./kit";

export type InvoiceLine = {
  name: string;
  details: string;
  quantity: string;
  unitPrice: number | string | null | undefined;
  amount: number | string | null | undefined;
};

export type InvoicePayment = {
  date: string | null | undefined;
  method: string | null | undefined;
  amount: number | string | null | undefined;
};

export type InvoiceInput = {
  id: string;
  createdAt: string | null | undefined;
  status: string | null | undefined;
  archived: boolean;
  totalAmount: number | string;
  outstandingAmount: number | string;
  customer: {
    name: string | null | undefined;
    phone: string | number | null | undefined;
    address: string | null | undefined;
  };
  merchant: PdfMerchantInfo | null | undefined;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
};

export async function buildOrderInvoicePdf(input: InvoiceInput) {
  const number = `INV-${input.id.slice(0, 8).toUpperCase()}`;
  const doc = await createPdfDoc({ title: `Invoice ${number}`, subject: "Order invoice" });

  const total = pdfNumber(input.totalAmount);
  const outstanding = Math.max(0, pdfNumber(input.outstandingAmount));
  const paid = Math.max(0, total - outstanding);
  const status = input.archived ? "archived" : input.status;

  doc.letterhead(businessFromMerchant(input.merchant), {
    title: "Invoice",
    number,
    rows: [
      ["Order date", pdfDate(input.createdAt)],
      ["Issued", pdfDate(new Date().toISOString())],
      ["Order ref", input.id.slice(0, 8).toUpperCase()],
    ],
    badge: { text: statusLabel(status), tone: input.archived ? "neutral" : statusTone(status) },
  });

  // `customer_phone` is numeric in the DB, so local numbers lose their leading 0.
  const rawPhone = String(input.customer.phone ?? "").trim();
  const phone = /^\d{9}$/.test(rawPhone) ? `0${rawPhone}` : rawPhone;
  doc.infoCards([
    {
      label: "Bill to",
      lines: [
        { text: pdfText(input.customer.name), bold: true },
        ...(phone ? [{ text: `Tel: ${phone}` }] : []),
        ...(input.customer.address ? [{ text: input.customer.address }] : []),
      ],
    },
    {
      label: "Payment summary",
      lines: [
        { text: pdfMoney(outstanding), bold: true },
        { text: outstanding > 0 ? "Balance due" : "Fully paid — no balance due" },
        { text: `Paid ${pdfMoney(paid)} of ${pdfMoney(total)}` },
      ],
    },
  ]);

  const itemCount = input.lines.length;
  doc.sectionTitle("Items", `${itemCount} ${itemCount === 1 ? "item" : "items"}`);
  doc.table(
    [
      { header: "#", width: 8 },
      { header: "Item", width: 60 },
      { header: "Qty", width: 14, align: "right" },
      { header: "Unit price", width: 24, align: "right" },
      { header: "Amount", width: 26, align: "right" },
    ],
    input.lines.map((line, i) => [
      String(i + 1),
      { text: line.name, sub: line.details, bold: true },
      line.quantity,
      pdfMoney(line.unitPrice),
      { text: pdfMoney(line.amount), bold: true },
    ]),
    { empty: "No items on this order" },
  );

  doc.totals([
    { label: "Subtotal", value: pdfMoney(total) },
    { label: "Amount paid", value: pdfMoney(paid), tone: paid > 0 ? "success" : undefined },
    { label: "Balance due", value: pdfMoney(outstanding), emphasis: true },
  ]);

  if (input.payments.length > 0) {
    doc.sectionTitle("Payment history");
    doc.table(
      [
        { header: "Date", width: 30 },
        { header: "Method", width: 60 },
        { header: "Amount", width: 30, align: "right" },
      ],
      input.payments.map((p) => [pdfDate(p.date, true), pdfText(p.method), pdfMoney(p.amount)]),
      { footer: ["", "Total paid", pdfMoney(input.payments.reduce((s, p) => s + pdfNumber(p.amount), 0))] },
    );
  }

  // Closing note only where it fits; it isn't worth a page of its own.
  if (doc.fits(14)) {
    doc.paragraph("Thank you for your business!", { size: 10 });
    doc.paragraph(`Please quote ${number} with any payment or enquiry about this order.`, { size: 8 });
  }
  doc.finish(number);

  return { pdf: doc.pdf, fileName: `invoice-${input.id.slice(0, 8)}.pdf` };
}
