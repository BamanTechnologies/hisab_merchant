export type StockLabelInput = {
  id?: string | null;
  type?: string | null;
  product_type?: string | null;
  attributes?: Record<string, unknown> | null;
  model_number?: string | null;
  country?: string | null;
  thickness?: number | string | null;
  color?: string | null;
  figure?: string | null;
};

export function formatProductTypeLabel(t: string | null | undefined): string {
  const x = String(t ?? "").trim().toLowerCase();
  if (!x) return "—";
  if (x === "brake_lining" || x === "brake_pad" || x === "break_pad") {
    return "Brake lining";
  }
  return x.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** e.g. capacity `1000` + unit `ml` → `1000ML` */
export function formatCoffeeCapacityWithUnit(
  attrs: Record<string, unknown> | null | undefined,
): string {
  const a = attrs ?? {};
  const cap = a.capacity != null ? String(a.capacity).trim() : "";
  const u =
    a.capacity_unit != null
      ? String(a.capacity_unit).trim().replace(/\s+/g, "").toUpperCase()
      : "";
  if (!cap && !u) return "";
  if (!u) return cap;
  if (!cap) return u;
  return `${cap}${u}`;
}

/**
 * Build the identity portion of a stock/product label (no type suffix).
 * Standards per type: see `src/lib/inventory/PRODUCT_NAMING.md`.
 */
export function buildStockDescriptor(stock: StockLabelInput): string {
  const attrs = stock.attributes ?? {};
  const typeKey = String(stock.type ?? stock.product_type ?? "")
    .trim()
    .toLowerCase();

  if (typeKey === "coffee_tools") {
    const name = attrs.name != null ? String(attrs.name).trim() : "";
    const capU = formatCoffeeCapacityWithUnit(attrs);
    const descriptor = [name, capU].filter(Boolean).join(" ").trim();
    return descriptor || "Stock";
  }

  const thickness =
    attrs.thickness != null
      ? String(attrs.thickness).trim()
      : String(stock.thickness ?? "").trim();
  const color =
    attrs.color != null ? String(attrs.color).trim() : (stock.color?.trim() ?? "");
  const figure =
    attrs.figure != null ? String(attrs.figure).trim() : (stock.figure?.trim() ?? "");
  const model =
    attrs.model_number != null
      ? String(attrs.model_number).trim()
      : (stock.model_number?.trim() ?? "");
  const country =
    attrs.country != null
      ? String(attrs.country).trim()
      : (stock.country?.trim() ?? "");
  const glassBits = [thickness ? `${thickness}mm` : "", color, figure].filter(Boolean);
  const descriptor = glassBits.length > 0 ? glassBits.join(" ") : model || country || "Stock";
  const suffix = country && !descriptor.includes(country) ? ` ${country}` : "";
  return `${descriptor}${suffix}`.trim();
}

export function buildStockLabel(stock: StockLabelInput): string {
  const typeSuffix = formatProductTypeLabel(stock.type ?? stock.product_type ?? null);
  const descriptor = buildStockDescriptor(stock);
  return `${descriptor} (${typeSuffix})`.trim();
}
