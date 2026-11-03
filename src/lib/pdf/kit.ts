import type { jsPDF } from "jspdf";

/**
 * Shared building blocks for the PDFs we generate in the browser (order
 * invoices, investor statements). Every document gets the same letterhead,
 * table styling and footer so shared files look like they come from one place.
 */

type Rgb = [number, number, number];

export const pdfColors = {
  brand: [77, 160, 230] as Rgb,
  brandDark: [29, 78, 121] as Rgb,
  brandSoft: [237, 246, 253] as Rgb,
  ink: [17, 24, 39] as Rgb,
  text: [55, 65, 81] as Rgb,
  muted: [107, 114, 128] as Rgb,
  line: [229, 231, 235] as Rgb,
  soft: [248, 250, 252] as Rgb,
};

export type PdfTone = "success" | "warning" | "danger" | "neutral" | "brand";

const toneColors: Record<PdfTone, { fg: Rgb; bg: Rgb }> = {
  success: { fg: [21, 128, 61], bg: [220, 252, 231] },
  warning: { fg: [180, 83, 9], bg: [254, 243, 199] },
  danger: { fg: [185, 28, 28], bg: [254, 226, 226] },
  neutral: { fg: [75, 85, 99], bg: [243, 244, 246] },
  brand: { fg: [29, 78, 121], bg: [237, 246, 253] },
};

export type PdfBusiness = {
  name: string;
  lines: string[];
};

export type PdfMerchantInfo = {
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  address?: string | null;
  branchByBranch?: {
    name?: string | null;
    address?: string | null;
    companyByCompany?: {
      name?: string | null;
      tin_number?: number | string | null;
      license?: string | null;
    } | null;
  } | null;
};

/** GraphQL fragment matching `PdfMerchantInfo`, for queries that feed a PDF. */
export const PDF_MERCHANT_FIELDS = `
  first_name
  last_name
  phone_number
  address
  branchByBranch {
    name
    address
    companyByCompany {
      name
      tin_number
      license
    }
  }
`;

function clean(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function humanize(v: string): string {
  return v.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function merchantFullName(m: PdfMerchantInfo | null | undefined): string {
  return [clean(m?.first_name), clean(m?.last_name)].filter(Boolean).join(" ");
}

/** Letterhead identity: company name first, falling back to the merchant. */
export function businessFromMerchant(m: PdfMerchantInfo | null | undefined): PdfBusiness {
  const branch = m?.branchByBranch;
  const company = branch?.companyByCompany;
  const merchantName = merchantFullName(m);
  const name = clean(company?.name) || merchantName || "BamanStock Merchant";
  const branchName = clean(branch?.name);
  const lines = [
    [branchName ? `${humanize(branchName)} branch` : "", clean(branch?.address) || clean(m?.address)]
      .filter(Boolean)
      .join(" · "),
    clean(m?.phone_number) ? `Tel: ${clean(m?.phone_number)}` : "",
    [
      clean(company?.tin_number) ? `TIN: ${clean(company?.tin_number)}` : "",
      clean(company?.license) ? `License: ${clean(company?.license)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
  return { name, lines };
}

export function pdfNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Hasura `money` comes back as "$1,234.00"; always render it as ETB. */
export function pdfMoney(v: unknown): string {
  const n = pdfNumber(v);
  const formatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}ETB ${formatted}`;
}

export function pdfQuantity(v: unknown): string {
  return pdfNumber(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function pdfDate(v: string | null | undefined, withTime = false): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function pdfText(v: unknown): string {
  const s = clean(v);
  return s === "" ? "—" : s;
}

export function statusLabel(status: string | null | undefined, short = false): string {
  const s = clean(status).toLowerCase();
  if (short && s === "partially_paid") return "Partial";
  return s ? humanize(s) : "—";
}

export function statusTone(status: string | null | undefined): PdfTone {
  const s = clean(status).toLowerCase();
  if (s === "paid" || s === "sent" || s === "completed") return "success";
  if (s.startsWith("partial") || s === "pending") return "warning";
  if (s === "unpaid" || s === "failed" || s === "error") return "danger";
  return "neutral";
}

export type PdfCell =
  | string
  | {
      text: string;
      sub?: string;
      bold?: boolean;
      tone?: PdfTone;
    };

export type PdfColumn = {
  header: string;
  /** Relative weight; widths are scaled to fill the content width. */
  width: number;
  align?: "left" | "right";
};

type DocInfo = {
  title: string;
  number: string;
  rows: Array<[string, string]>;
  badge?: { text: string; tone: PdfTone };
};

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/bamanstock-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export class PdfDoc {
  readonly pdf: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly margin = 16;
  readonly contentWidth: number;
  private readonly logo: string | null;
  private readonly bottomLimit: number;
  y = 0;

  constructor(pdf: jsPDF, logo: string | null) {
    this.pdf = pdf;
    this.logo = logo;
    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.pageHeight = pdf.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.bottomLimit = this.pageHeight - 22;
    this.startPage();
  }

  private startPage() {
    this.pdf.setFillColor(...pdfColors.brand);
    this.pdf.rect(0, 0, this.pageWidth, 3, "F");
    this.y = 14;
  }

  fits(height: number): boolean {
    return this.y + height <= this.bottomLimit;
  }

  /** Adds a page when `height` won't fit. Returns true when a page was added. */
  ensureSpace(height: number): boolean {
    if (this.fits(height)) return false;
    this.pdf.addPage();
    this.startPage();
    return true;
  }

  private font(size: number, style: "normal" | "bold" = "normal", color: Rgb = pdfColors.text) {
    this.pdf.setFont("helvetica", style);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }

  badge(text: string, tone: PdfTone, x: number, y: number, align: "left" | "right" = "left") {
    const { fg, bg } = toneColors[tone];
    this.font(7.5, "bold", fg);
    const label = text.toUpperCase();
    const w = this.pdf.getTextWidth(label) + 6;
    const left = align === "right" ? x - w : x;
    this.pdf.setFillColor(...bg);
    this.pdf.roundedRect(left, y, w, 5.6, 2.8, 2.8, "F");
    this.pdf.text(label, left + 3, y + 3.9);
    return w;
  }

  letterhead(business: PdfBusiness, doc: DocInfo) {
    const { pdf, margin, pageWidth } = this;
    const right = pageWidth - margin;
    const top = this.y + 4;

    this.font(16, "bold", pdfColors.ink);
    const nameLines: string[] = pdf.splitTextToSize(business.name, this.contentWidth * 0.55);
    pdf.text(nameLines, margin, top);
    let leftY = top + nameLines.length * 6.5;
    this.font(8.5, "normal", pdfColors.muted);
    for (const line of business.lines) {
      const wrapped: string[] = pdf.splitTextToSize(line, this.contentWidth * 0.55);
      pdf.text(wrapped, margin, leftY);
      leftY += wrapped.length * 4.2;
    }

    this.font(20, "bold", pdfColors.brandDark);
    pdf.text(doc.title.toUpperCase(), right, top + 1, { align: "right" });
    this.font(9, "bold", pdfColors.text);
    pdf.text(doc.number, right, top + 7.5, { align: "right" });
    let rightY = top + 13.5;
    for (const [label, value] of doc.rows) {
      this.font(8.5, "bold", pdfColors.ink);
      pdf.text(value, right, rightY, { align: "right" });
      const valueWidth = pdf.getTextWidth(value);
      this.font(8.5, "normal", pdfColors.muted);
      pdf.text(`${label}:`, right - valueWidth - 2, rightY, { align: "right" });
      rightY += 4.6;
    }
    if (doc.badge) {
      this.badge(doc.badge.text, doc.badge.tone, right, rightY - 1.5, "right");
      rightY += 6;
    }

    this.y = Math.max(leftY, rightY) + 3;
    pdf.setDrawColor(...pdfColors.line);
    pdf.setLineWidth(0.3);
    pdf.line(margin, this.y, right, this.y);
    this.y += 7;
  }

  sectionTitle(text: string, note?: string) {
    this.ensureSpace(22);
    this.font(10.5, "bold", pdfColors.ink);
    this.pdf.text(text, this.margin, this.y);
    if (note) {
      this.font(8, "normal", pdfColors.muted);
      this.pdf.text(note, this.pageWidth - this.margin, this.y, { align: "right" });
    }
    this.y += 3.5;
  }

  /** Side-by-side panels, e.g. "Bill to" / "Prepared for". */
  infoCards(cards: Array<{ label: string; lines: Array<{ text: string; bold?: boolean }> }>) {
    const gap = 6;
    const width = (this.contentWidth - gap * (cards.length - 1)) / cards.length;
    const pad = 5;
    const layouts = cards.map((card) =>
      card.lines.map((line) => ({
        ...line,
        wrapped: this.pdf.splitTextToSize(line.text, width - pad * 2) as string[],
      })),
    );
    const height =
      Math.max(
        ...layouts.map((lines) =>
          lines.reduce((h, l) => h + l.wrapped.length * (l.bold ? 5.2 : 4.3), 0),
        ),
      ) + 14;
    this.ensureSpace(height);

    cards.forEach((card, i) => {
      const x = this.margin + i * (width + gap);
      this.pdf.setFillColor(...pdfColors.soft);
      this.pdf.setDrawColor(...pdfColors.line);
      this.pdf.roundedRect(x, this.y, width, height, 2, 2, "FD");
      this.font(7.5, "bold", pdfColors.brandDark);
      this.pdf.text(card.label.toUpperCase(), x + pad, this.y + 6.5);
      let ly = this.y + 12.5;
      for (const line of layouts[i]) {
        this.font(line.bold ? 10.5 : 8.5, line.bold ? "bold" : "normal", line.bold ? pdfColors.ink : pdfColors.text);
        this.pdf.text(line.wrapped, x + pad, ly);
        ly += line.wrapped.length * (line.bold ? 5.2 : 4.3);
      }
    });
    this.y += height + 8;
  }

  /** Row of headline figures. */
  kpis(items: Array<{ label: string; value: string; sub?: string; tone?: PdfTone }>) {
    const gap = 4;
    const width = (this.contentWidth - gap * (items.length - 1)) / items.length;
    const height = 21;
    this.ensureSpace(height);
    items.forEach((item, i) => {
      const x = this.margin + i * (width + gap);
      const tone = toneColors[item.tone ?? "brand"];
      this.pdf.setFillColor(...pdfColors.soft);
      this.pdf.setDrawColor(...pdfColors.line);
      this.pdf.roundedRect(x, this.y, width, height, 2, 2, "FD");
      this.pdf.setFillColor(...tone.fg);
      this.pdf.rect(x, this.y + 2, 1.2, height - 4, "F");
      this.font(7, "bold", pdfColors.muted);
      this.pdf.text(item.label.toUpperCase(), x + 5, this.y + 6);
      this.font(11.5, "bold", item.tone && item.tone !== "brand" ? tone.fg : pdfColors.ink);
      this.pdf.text(item.value, x + 5, this.y + 12.5, { maxWidth: width - 7 });
      if (item.sub) {
        this.font(7, "normal", pdfColors.muted);
        this.pdf.text(item.sub, x + 5, this.y + 17.5, { maxWidth: width - 7 });
      }
    });
    this.y += height + 9;
  }

  /**
   * Table with wrapped cells. The header row is repeated whenever the table
   * spills onto a new page, and an optional footer row holds totals.
   */
  table(columns: PdfColumn[], rows: PdfCell[][], opts: { footer?: PdfCell[]; empty?: string } = {}) {
    const { pdf, margin } = this;
    const totalWeight = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / totalWeight) * this.contentWidth);
    const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((s, w) => s + w, 0));
    const pad = 2.4;
    const lineH = 3.7;
    const headerH = 8;

    const drawHeader = () => {
      pdf.setFillColor(...pdfColors.brandSoft);
      pdf.rect(margin, this.y, this.contentWidth, headerH, "F");
      pdf.setDrawColor(...pdfColors.brand);
      pdf.setLineWidth(0.4);
      pdf.line(margin, this.y + headerH, margin + this.contentWidth, this.y + headerH);
      this.font(7, "bold", pdfColors.brandDark);
      columns.forEach((c, i) => {
        const x = c.align === "right" ? xs[i] + widths[i] - pad : xs[i] + pad;
        pdf.text(c.header.toUpperCase(), x, this.y + 5.2, { align: c.align ?? "left" });
      });
      this.y += headerH;
    };

    const normalize = (cell: PdfCell) => (typeof cell === "string" ? { text: cell } : cell);

    const layoutRow = (cells: PdfCell[], bold = false) => {
      const laid = cells.map((raw, i) => {
        const cell = normalize(raw);
        this.font(8.3, bold || cell.bold ? "bold" : "normal");
        const main: string[] = cell.tone ? [cell.text] : pdf.splitTextToSize(cell.text, widths[i] - pad * 2);
        this.font(7, "normal");
        const sub: string[] = cell.sub ? pdf.splitTextToSize(cell.sub, widths[i] - pad * 2) : [];
        return { cell, main, sub };
      });
      const lines = Math.max(...laid.map((l) => l.main.length * lineH + l.sub.length * 3.3));
      return { laid, height: Math.max(8, lines + pad * 2 + 0.6) };
    };

    const drawRow = (row: ReturnType<typeof layoutRow>, fill: boolean, bold = false) => {
      if (fill) {
        pdf.setFillColor(...pdfColors.soft);
        pdf.rect(margin, this.y, this.contentWidth, row.height, "F");
      }
      row.laid.forEach(({ cell, main, sub }, i) => {
        const align = columns[i].align ?? "left";
        const x = align === "right" ? xs[i] + widths[i] - pad : xs[i] + pad;
        const top = this.y + pad + 3;
        if (cell.tone) {
          this.badge(cell.text, cell.tone, x, top - 3.9, align);
          return;
        }
        this.font(8.3, bold || cell.bold ? "bold" : "normal", pdfColors.ink);
        pdf.text(main, x, top, { align });
        if (sub.length) {
          this.font(7, "normal", pdfColors.muted);
          pdf.text(sub, x, top + main.length * lineH - 0.4, { align });
        }
      });
      this.y += row.height;
      pdf.setDrawColor(...pdfColors.line);
      pdf.setLineWidth(0.2);
      pdf.line(margin, this.y, margin + this.contentWidth, this.y);
    };

    this.ensureSpace(headerH + 10);
    drawHeader();

    if (rows.length === 0) {
      this.font(8.5, "normal", pdfColors.muted);
      pdf.text(opts.empty ?? "No records", margin + pad, this.y + 6);
      this.y += 10;
    }

    rows.forEach((cells, index) => {
      const row = layoutRow(cells);
      if (this.ensureSpace(row.height)) drawHeader();
      drawRow(row, index % 2 === 1);
    });

    if (opts.footer) {
      const row = layoutRow(opts.footer, true);
      if (this.ensureSpace(row.height)) drawHeader();
      pdf.setDrawColor(...pdfColors.ink);
      pdf.setLineWidth(0.4);
      pdf.line(margin, this.y, margin + this.contentWidth, this.y);
      drawRow(row, false, true);
    }
    this.y += 9;
  }

  /** Right-aligned summary block; the `emphasis` row is drawn as a filled bar. */
  totals(rows: Array<{ label: string; value: string; emphasis?: boolean; tone?: PdfTone }>) {
    const width = 82;
    const x = this.pageWidth - this.margin - width;
    const right = this.pageWidth - this.margin;
    this.ensureSpace(rows.length * 7 + 8);
    for (const row of rows) {
      if (row.emphasis) {
        this.y += 1;
        this.pdf.setFillColor(...pdfColors.brandDark);
        this.pdf.roundedRect(x, this.y - 5, width, 9.5, 1.5, 1.5, "F");
        this.font(10, "bold", [255, 255, 255]);
        this.pdf.text(row.label, x + 4, this.y + 1.2);
        this.pdf.text(row.value, right - 4, this.y + 1.2, { align: "right" });
        this.y += 10;
        continue;
      }
      this.font(9, "normal", pdfColors.muted);
      this.pdf.text(row.label, x + 4, this.y);
      this.font(9, "bold", row.tone ? toneColors[row.tone].fg : pdfColors.ink);
      this.pdf.text(row.value, right - 4, this.y, { align: "right" });
      this.y += 6.5;
    }
    this.y += 5;
  }

  paragraph(text: string, opts: { size?: number; color?: Rgb } = {}) {
    const size = opts.size ?? 9;
    this.font(size, "normal", opts.color ?? pdfColors.text);
    const lines: string[] = this.pdf.splitTextToSize(text, this.contentWidth);
    const lineH = size * 0.5;
    for (const line of lines) {
      this.ensureSpace(lineH);
      this.pdf.text(line, this.margin, this.y);
      this.y += lineH;
    }
    this.y += 3;
  }

  /** Draws the footer on every page; call once all content is placed. */
  finish(footerLabel: string) {
    const { pdf, margin, pageWidth, pageHeight } = this;
    const total = pdf.getNumberOfPages();
    const generated = `Generated ${pdfDate(new Date().toISOString(), true)}`;
    for (let page = 1; page <= total; page += 1) {
      pdf.setPage(page);
      const lineY = pageHeight - 15;
      pdf.setDrawColor(...pdfColors.line);
      pdf.setLineWidth(0.3);
      pdf.line(margin, lineY, pageWidth - margin, lineY);
      this.font(7.5, "normal", pdfColors.muted);
      pdf.text(`${footerLabel} · ${generated}`, margin, lineY + 5.5);
      pdf.text(`Page ${page} of ${total}`, pageWidth - margin, lineY + 5.5, { align: "right" });
      if (this.logo) {
        // Logo PNG is 660×277 with built-in padding.
        pdf.addImage(this.logo, "PNG", pageWidth / 2 - 11, lineY + 0.8, 22, 9.2);
      } else {
        pdf.text("Powered by BamanStock", pageWidth / 2, lineY + 5.5, { align: "center" });
      }
    }
  }
}

export async function createPdfDoc(info: { title: string; subject?: string }): Promise<PdfDoc> {
  const [{ default: JsPDF }, logo] = await Promise.all([import("jspdf"), loadLogo()]);
  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  pdf.setProperties({
    title: info.title,
    subject: info.subject ?? info.title,
    creator: "BamanStock",
    author: "BamanStock",
  });
  return new PdfDoc(pdf, logo);
}
