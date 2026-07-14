<script lang="ts">
  import TablePagination from "$lib/components/TablePagination.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import { paginateSlice } from "$lib/pagination.js";
  import { formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
  import { parseQty } from "$lib/inventory/fifo";
  import type { StockMovementRecord } from "$lib/inventory/types";
  import type { PageData } from "./$types";

  type StockBatch = {
    id: string;
    batch_number?: string | null;
    quantity?: number | string | null;
    purchased_price?: number | string | null;
    selling_price?: number | string | null;
    created_at?: string | null;
  };

  type ProductType = { id: string; name?: string | null };
  type Product = {
    id: string;
    name: string;
    displayName: string;
    default_unit: string;
    attributes?: Record<string, unknown> | null;
    investors?: string[] | null;
    is_active?: boolean | null;
    barcode?: string | null;
    qr_code?: string | null;
    treshold_quantity?: number | string | null;
    total_stock?: number;
    created_at?: string | null;
    product_type?: ProductType | null;
  };

  let { data }: { data: PageData } = $props();

  const product = data.product as Product;
  const movements = (data.movements ?? []) as StockMovementRecord[];
  const batches = (data.batches ?? []) as StockBatch[];
  const canViewPurchasePrice = data.canViewPurchasePrice !== false;

  let batchPage = $state(1);
  let batchPageSize = $state(10);
  let tablePage = $state(1);
  let tablePageSize = $state(10);

  const PRODUCT_TYPE_FIELDS: Record<string, string[]> = {
    glass: ["thickness", "color", "figure", "factor"],
    brake_lining: ["model_number", "country"],
    coffee_tools: ["name", "capacity", "capacity_unit"],
  };

  const pagedMovements = $derived(
    paginateSlice(movements, tablePage, tablePageSize),
  );

  const pagedBatches = $derived(
    paginateSlice(batches, batchPage, batchPageSize),
  );

  function parseMoneyValue(value: number | string | null | undefined): number {
    if (value == null || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const n = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(value: number | string | null | undefined): string {
    const n = parseMoneyValue(value);
    return `ETB ${n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function batchQtyLabel(batch: StockBatch): string {
    const q = parseQty(batch.quantity);
    const unit = String(product.default_unit ?? "").trim();
    return unit ? `${q.toLocaleString()} ${unit}` : q.toLocaleString();
  }

  function typeFromProduct(): string {
    return String(product?.product_type?.name ?? "")
      .trim()
      .toLowerCase();
  }

  function typeDisplay(t: string | null | undefined) {
    const x = String(t ?? "").trim();
    if (!x) return "—";
    if (x === "brake_lining" || x === "brake_pad" || x === "break_pad")
      return "Brake lining";
    return x.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function attributeLabel(key: string): string {
    if (key === "model_number") return "Model No";
    if (key === "capacity_unit") return "Capacity unit";
    return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function dash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  function attrValue(key: string): string {
    if (typeFromProduct() === "coffee_tools" && key === "capacity") {
      const merged = formatCoffeeCapacityWithUnit(product.attributes ?? null);
      if (merged) return merged;
    }
    const attrs = product.attributes ?? {};
    const v = attrs[key];
    return dash(v);
  }

  const dynamicFields = $derived.by(() => {
    const raw =
      PRODUCT_TYPE_FIELDS[typeFromProduct()] ??
      Object.keys(product.attributes ?? {});
    if (typeFromProduct() === "coffee_tools") {
      return raw.filter((k) => k !== "capacity_unit");
    }
    return raw;
  });

  const tresholdVal = $derived(
    product.treshold_quantity != null ? Number(product.treshold_quantity) : 0,
  );
  const totalStockVal = $derived(product.total_stock ?? 0);
  const isBelowThreshold = $derived(
    tresholdVal > 0 && totalStockVal < tresholdVal,
  );

  const productDetailRows = $derived.by(() => {
    const rows: { label: string; value: string }[] = [
      { label: "Name", value: product.displayName || product.name || "—" },
      { label: "Default unit", value: dash(product.default_unit) },
      {
        label: "Status",
        value: product.is_active === false ? "Inactive" : "Active",
      },
      { label: "Barcode", value: dash(product.barcode) },
      { label: "QR code", value: dash(product.qr_code) },
    ];
    if (tresholdVal > 0) {
      rows.push({ label: "Stock threshold", value: String(tresholdVal) });
    }
    for (const key of dynamicFields) {
      rows.push({ label: attributeLabel(key), value: attrValue(key) });
    }
    return rows;
  });

  function formatDate(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function movementTypeLabel(type: string | null | undefined): string {
    const t = String(type ?? "")
      .trim()
      .toUpperCase();
    if (!t) return "—";
    return t
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function formatQtyDelta(delta: number | string | null | undefined): string {
    const n = Number(delta);
    if (!Number.isFinite(n)) return dash(delta);
    if (n > 0) return `+${n}`;
    return String(n);
  }

  function batchNumber(m: StockMovementRecord): string {
    return dash(m.stock?.batch_number);
  }
</script>

<section class={mc.pageHeader}>
  <div>
    <p class="mb-2">
      <a href="/products" class={mc.link}>← Back to products</a>
    </p>
    <h1 class={mc.pageTitle}>{product.displayName || product.name}</h1>
    <p class={mc.pageSubtitle}>{typeDisplay(typeFromProduct())}</p>
  </div>
</section>

<div class={mc.tableSection}>
  <div
    class="border-b border-[#e6eaed] bg-[#f2f2f2] px-5 py-4 dark:border-white/10 dark:bg-[#111827]"
  >
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p
          class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
        >
          Product catalog
        </p>
        <p
          class="mt-1 text-lg font-semibold text-[#1a1a1a] dark:text-gray-100"
        >
          {product.name || "—"}
        </p>
      </div>
      <div class="flex flex-wrap gap-8 sm:gap-10">
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
            Default unit
          </p>
          <p
            class="mt-1 text-lg font-bold tabular-nums text-[#1a1a1a] dark:text-gray-100"
          >
            {product.default_unit || "—"}
          </p>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
            Status
          </p>
          <p
            class="mt-1 text-lg font-bold text-[#1a1a1a] dark:text-gray-100"
          >
            {product.is_active === false ? "Inactive" : "Active"}
          </p>
        </div>
      </div>
    </div>
  </div>

  {#if isBelowThreshold}
    <div
      class="flex items-center gap-2 border-b border-[#e6eaed] bg-amber-50 px-5 py-3 dark:border-white/10 dark:bg-amber-950/30"
    >
      <span class="text-sm font-semibold text-amber-700 dark:text-amber-400">
        Low stock — only {totalStockVal} {product.default_unit || "unit"}{totalStockVal === 1 ? "" : "s"} available
        (threshold: {tresholdVal})
      </span>
    </div>
  {/if}
  <dl
    class="grid divide-x divide-y divide-[#e6eaed] dark:divide-white/10 sm:grid-cols-2 lg:grid-cols-3"
  >
    {#each productDetailRows as row}
      <div class="bg-white px-5 py-3.5 dark:bg-[#0f172a]">
        <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">
          {row.label}
        </dt>
        <dd
          class="mt-1 text-sm font-medium leading-snug text-[#1a1a1a] dark:text-gray-100"
        >
          {row.value}
        </dd>
      </div>
    {/each}
  </dl>
</div>

<section class="{mc.tableSection} mt-6">
  <div class={mc.tableToolbar}>
    <h2 class="text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">
      Inventory batches
    </h2>
    <span class="text-sm text-gray-500 dark:text-gray-400">
      {batches.length} batch{batches.length === 1 ? "" : "es"}
    </span>
  </div>
  <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>#</th>
          <th class={mc.th}>Batch #</th>
          <th class={mc.thCenter}>Qty on hand</th>
          {#if canViewPurchasePrice}
            <th class={mc.thCenter}>Purchase price</th>
          {/if}
          <th class={mc.thCenter}>Selling price</th>
          <th class={mc.th}>Received</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedBatches as batch, i}
          <tr>
            <td class={mc.colNum}>{(batchPage - 1) * batchPageSize + i + 1}</td>
            <td class={mc.td}>{dash(batch.batch_number)}</td>
            <td class="{mc.tdRight} tabular-nums">{batchQtyLabel(batch)}</td>
            {#if canViewPurchasePrice}
              <td class="{mc.tdRight} tabular-nums">{formatMoney(batch.purchased_price)}</td>
            {/if}
            <td class="{mc.tdRight} tabular-nums">{formatMoney(batch.selling_price)}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums">
              {formatDate(batch.created_at)}
            </td>
          </tr>
        {/each}
        {#if batches.length === 0}
          <tr>
            <td colspan={canViewPurchasePrice ? 6 : 5} class={mc.emptyCell}>
              No inventory batches linked to this product yet.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  {#if batches.length > 0}
    <TablePagination
      bind:page={batchPage}
      bind:pageSize={batchPageSize}
      total={batches.length}
      resetKey={batches.length}
    />
  {/if}
</section>

<section class="{mc.tableSection} mt-6">
  <div class={mc.tableToolbar}>
    <h2 class="text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">
      Stock movements
    </h2>
    <span class="text-sm text-gray-500 dark:text-gray-400">
      {movements.length} record{movements.length === 1 ? "" : "s"}
    </span>
  </div>
  <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>#</th>
          <th class={mc.th}>Date</th>
          <th class={mc.th}>Type</th>
          <th class={mc.thRight}>Qty delta</th>
          <th class={mc.th}>Unit</th>
          <th class={mc.th}>Batch #</th>
          <th class={mc.th}>Note</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedMovements as m, i}
          <tr>
            <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums">
              {formatDate(m.created_at)}
            </td>
            <td class={mc.td}>{movementTypeLabel(m.movement_type)}</td>
            <td class="{mc.tdRight} tabular-nums">
              {formatQtyDelta(m.quantity_delta)}
            </td>
            <td class={mc.td}>{dash(m.unit ?? product.default_unit)}</td>
            <td class={mc.td}>{batchNumber(m)}</td>
            <td class={mc.td}>{dash(m.note)}</td>
          </tr>
        {/each}
        {#if movements.length === 0}
          <tr>
            <td colspan="7" class={mc.emptyCell}>
              No stock movements recorded for this product yet.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  {#if movements.length > 0}
    <TablePagination
      bind:page={tablePage}
      bind:pageSize={tablePageSize}
      total={movements.length}
      resetKey={movements.length}
    />
  {/if}
</section>
