/** Matches order creation: glass lines use stock `factor` in total = qty × unit × factor. */

function asFiniteNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isGlassType(t: unknown): boolean {
  return String(t ?? '')
    .trim()
    .toLowerCase() === 'glass';
}

/** Positive factor from stock row, or null if missing / invalid / non-positive. */
function parsePositiveFactor(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = asFiniteNumber(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type ReportStockRow = {
  id?: string;
  type?: unknown;
  factor?: unknown;
};

export type ReportOrderRow = {
  stock_id?: unknown;
  order_quantity?: unknown;
  total_amount?: unknown;
};

/**
 * Sold unit price (what the user entered as unit price), for report preview / SMS.
 * - Glass + valid factor: (total / qty) / factor
 * - Otherwise: total / qty
 */
export function soldUnitPriceForReportOrder(
  order: ReportOrderRow,
  stocks: ReportStockRow[],
): string {
  const qty = asFiniteNumber(order.order_quantity);
  const total = asFiniteNumber(order.total_amount);
  if (qty <= 0) return '0.00';

  const perQtyLine = total / qty;
  const sid = order.stock_id != null ? String(order.stock_id).trim() : '';
  const stock = sid ? stocks.find((s) => s.id === sid) : undefined;
  const factor = stock != null ? parsePositiveFactor(stock.factor) : null;

  if (stock && isGlassType(stock.type) && factor != null) {
    return (perQtyLine / factor).toFixed(2);
  }
  return perQtyLine.toFixed(2);
}
