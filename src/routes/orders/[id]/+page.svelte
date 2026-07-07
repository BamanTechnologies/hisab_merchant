<script lang="ts">
  import { enhance } from "$app/forms";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import { mc, statusChipClass } from "$lib/merchant-styles.js";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { paginateSlice } from "$lib/pagination.js";
  import { formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";
  import type { PageData } from "./$types";

  type ProductType = {
    id: string;
    name: string;
  };

  type StockProduct={
    id:string
    product_type?: ProductType | null;
  }

  type OrderStock = {
    id: string;
    product_type?: string | null;
    attributes?: Record<string, unknown> | null;
    model_number?: string | null;
    country?: string | null;
    branch?: string | null;
    type?: string | null;
    color?: string | null;
    created_by: string;
    figure?: string | null;
    investors?: string[] | null;
    merchant?: { id: string } | null;
    quantity: number;
    selling_price: number | string;
    thickness?: number | string | null;
    factor?: number | null;
    unit?: string | null;
    product?: StockProduct | null;
  };

  type OrderItemBatch = {
    stock_id: string;
    quantity: number;
    unit_price?: number | null;
    line_total?: number | null;
    factor_snapshot?: number | null;
    stock?: {
      id: string;
      selling_price: number;
      quantity: number;
      batch_number?: string | null;
      created_at: string;
      unit?: string | null;
    } | null;
  };

  type OrderItem = {
    id: string;
    stock_id: string;
    quantity: number;
    unit?: string | null;
    unit_price?: number | string | null;
    line_total?: number | string | null;
    factor_snapshot?: number | string | null;
    order_item_batches?: OrderItemBatch[] | null;
    stock?: OrderStock | null;
  };

  type InvestorRow = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };

  type Order = {
    id: string;
    created_by: string;
    customer_address: string;
    customer_name: string;
    customer_phone: string;
    order_quantity: number;
    status: string;
    stock_id: string;
    total_amount: number;
    outstanding_amount: number;
    unit?: string | null;
    order_items?: OrderItem[] | null;
    stock?: OrderStock | null;
  };

  function orderQuantityLabel(o: Order) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    return u ? `${o.order_quantity} ${u}` : String(o.order_quantity);
  }

  function reportStockTypeLabel(t: string | null | undefined) {
    if (t === "glass") return "Glass";
    if (t === "brake_lining" || t === "brake_pad" || t === "break_pad")
      return "Brake lining";
    if (t === "coffee_tools") return "Coffee tools";
    return t && String(t).trim() !== "" ? String(t) : "—";
  }
  const PRODUCT_TYPE_FIELDS: Record<string, string[]> = {
    glass: ["thickness", "color", "figure", "factor"],
    brake_lining: ["model_number", "country"],
    coffee_tools: ["name", "capacity", "capacity_unit"],
  };
  function stockTypeKey(s: OrderStock): string {
    return String(s.type ?? s.product_type ?? s.product?.product_type?.name ?? "").trim().toLowerCase();
  }
  function stockAttr(s: OrderStock, key: string): string {
    if (stockTypeKey(s) === "coffee_tools" && key === "capacity") {
      const merged = formatCoffeeCapacityWithUnit(s.attributes);
      if (merged) return merged;
    }
    const attrs = {...(s.product?.attributes ?? {}), ...(s.attributes ?? {})};
    const fallback: Record<string, unknown> = {
      model_number: s.model_number,
      country: s.country,
      color: s.color,
      figure: s.figure,
      thickness: s.thickness,
      factor: s.factor,
    };
    return reportDash(attrs[key] ?? fallback[key]);
  }
  function attrLabel(key: string): string {
    if (key === "model_number") return "Model No";
    if (key === "capacity_unit") return "Capacity unit";
    return key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function orderStockAttrEntries(s: OrderStock): [string, string][] {
    const attrs = {...(s.product?.attributes ?? {}), ...(s.attributes ?? {})};
    if (stockTypeKey(s) !== "coffee_tools") {
      return Object.entries(attrs).map(([k, v]) => [
        k,
        v == null ? "" : String(v),
      ]);
    }
    const merged = formatCoffeeCapacityWithUnit(attrs);
    const out: [string, string][] = [];
    let mergedShown = false;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "capacity" || k === "capacity_unit") {
        if (!mergedShown && merged) {
          out.push(["capacity", merged]);
          mergedShown = true;
        }
        continue;
      }
      out.push([k, v == null ? "" : String(v)]);
    }
    if (!mergedShown && merged) {
      out.push(["capacity", merged]);
    }
    return out;
  }
  function reportDash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }

  let { data }: { data: PageData } = $props();
  const order = data.order as Order | undefined;
  const investors = (data.investors ?? []) as InvestorRow[];
  const merchantId = data.merchantId as string | undefined;

  const orderItems = $derived.by(() => {
    const fromItems = (order?.order_items ?? []).filter(
      (x): x is OrderItem => Boolean(x && typeof x === "object"),
    );
    if (fromItems.length > 0) return fromItems;
    return order?.stock
      ? [
          {
            id: "",
            stock_id: order.stock_id,
            quantity: order.order_quantity,
            unit: order.unit ?? order.stock.unit ?? null,
            unit_price: undefined,
            line_total: order.total_amount,
            order_item_batches: [],
            stock: order.stock,
          } satisfies OrderItem,
        ]
      : [];
  });
  const orderStocks = $derived(orderItems.map((x) => x.stock).filter(Boolean) as OrderStock[]);
  const singleType = $derived.by(() => {
    const keys = new Set(orderStocks.map((s) => stockTypeKey(s)));
    return keys.size === 1 ? [...keys][0] : "";
  });
  const dynamicFields = $derived.by(() => {
    if (!singleType) return [] as string[];
    const fields = PRODUCT_TYPE_FIELDS[singleType] ?? [];
    if (singleType === "coffee_tools") {
      return fields.filter((k) => k !== "capacity_unit");
    }
    return fields;
  });

  function stockInvestorLabels(stock: OrderStock): string {
    const ids = stock.investors ?? [];
    if (ids.length === 0) return "—";
    return ids
      .map((investorId) => {
        if (investorId === merchantId) return "Myself";
        const inv = investors.find((i) => i.id === investorId);
        return inv
          ? `${inv.first_name} ${inv.last_name}`.trim()
          : "Unknown";
      })
      .join(", ");
  }

  let lineItemsPage = $state(1);
  let lineItemsPageSize = $state(10);
  const pagedOrderItems = $derived(
    paginateSlice(orderItems, lineItemsPage, lineItemsPageSize),
  );

  let expandedRows = $state(new Set<number>());
  function toggleRow(index: number) {
    const next = new Set(expandedRows);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    expandedRows = next;
  }

  // Define bank list once as the single source of truth
  const banks = [
    "Commercial Bank of Ethiopia (CBE)",
    "Awash International Bank",
    "Dashen Bank",
    "Bank of Abyssinia",
    "Wegagen Bank",
    "Nib International Bank",
    "Cooperative Bank of Oromia",
    "Zemen Bank",
    "Bunna International Bank",
    "Berhan International Bank",
    "Enat Bank",
    "Oromia International Bank",
    "Hibret Bank",
    "Abay Bank",
    "Addis International Bank",
    "Amhara Bank",
    "Rammis Bank",
    "Siinqee Bank",
    "Shabelle Bank",
    "ZamZam Bank",
    "Hijra Bank",
  ] as const;

  let showPay = $state(false);
  const subscriptionLocked = $derived($subscriptionBlocksMutations);
  let paymentFormPending = $state(false);
  let payAmount = $state<number | undefined>(undefined);
  let payMethod = $state<(typeof banks)[number] | "">("");
  function parseMoney(value: string | number): number {
    if (typeof value === "number") return value;

    return Number(value.replace(/[$,]/g, ""));
}
const remainingAfterPay = $derived.by(() => {
    if (!order) return 0;

    const outstanding = parseMoney(order.outstanding_amount);
    const payment = payAmount ?? 0;

    return Math.max(0, outstanding - payment);
});

  let errorMessage = $state("");
  let successMessage = $state("");

  function submitPayment(e: Event) {
    // Allow form to submit naturally to server action
    // No preventDefault needed
  }

</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>Order Details</h1>
  </div>
  {#if order}
    <button
      type="button"
      class={mc.primaryBtn}
      disabled={order.status === "paid" || order.status === "cancelled" || subscriptionLocked}
      title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : undefined}
      onclick={() => {
        if (subscriptionLocked) return;
        showPay = true;
      }}>Pay</button
    >
  {/if}
</section>

{#if errorMessage}
  <div class={mc.alertError}>
    <p>{errorMessage}</p>
  </div>
{/if}

{#if successMessage}
  <div class={mc.alertSuccess}>
    <p>{successMessage}</p>
  </div>
{/if}

{#if order}
    <div class="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0f172a] dark:shadow-none">
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Order information</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Customer:</span>
          <span class="ml-1 text-gray-900 dark:text-gray-100">{order.customer_name}</span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Phone:</span>
          <span class="ml-1 text-gray-900 dark:text-gray-100">{order.customer_phone || "—"}</span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Address:</span>
          <span class="ml-1 text-gray-900 dark:text-gray-100">{order.customer_address || "—"}</span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Quantity:</span>
          <span class="ml-1 text-gray-900 dark:text-gray-100">{orderQuantityLabel(order)}</span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Status:</span>
          <span class="ml-2"><span class={statusChipClass(order.status)}>{order.status}</span></span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Total amount:</span>
          <span class="ml-1 font-semibold text-gray-900 dark:text-gray-100">{formatMoney(order.total_amount)}</span>
        </div>
        <div class="text-sm">
          <span class="font-medium text-gray-500 dark:text-gray-400">Outstanding:</span>
          <span class="ml-1 font-semibold text-gray-900 dark:text-gray-100">{formatMoney(order.outstanding_amount)}</span>
        </div>
      </div>
    </div>

    <div class="mb-6">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Stocks ({orderStocks.length})</h2>
      {#if orderStocks.length > 0}
        <section class={mc.tableSection}>
          <div class="overflow-x-auto">
          <table class={mc.table}>
            <thead>
              <tr>
                <th class={mc.colNumHead}>#</th>
                <th class={mc.th}>Type</th>
                {#if dynamicFields.length > 0}
                  {#each dynamicFields as f}
                    <th class={mc.th}>{attrLabel(f)}</th>
                  {/each}
                {:else}
                  <th class={mc.th}>Attributes</th>
                {/if}
                <th class={mc.th}>Quantity</th>
                <th class={mc.th}>Price</th>
                <th class={mc.th}>Total amount</th>
                <th class={mc.th}>Investors</th>
                <th class={mc.th}></th>
              </tr>
            </thead>
            <tbody>
              {#each pagedOrderItems as item, i (`${item.stock_id}-${(lineItemsPage - 1) * lineItemsPageSize + i}`)}
                {@const s = item.stock}
                {@const globalIdx = (lineItemsPage - 1) * lineItemsPageSize + i}
                {@const hasMultipleBatches = (item.order_item_batches?.length ?? 0) > 1}
                <tr
                  class="hover:bg-gray-50 dark:hover:bg-white/5"
                  onclick={hasMultipleBatches ? () => toggleRow(globalIdx) : undefined}
                  role={hasMultipleBatches ? "button" : undefined}
                  tabindex={hasMultipleBatches ? 0 : undefined}
                  onkeydown={hasMultipleBatches ? (e) => (e.key === "Enter" || e.key === " ") && toggleRow(globalIdx) : undefined}
                >
                  <td class={mc.colNum}>
                    {#if hasMultipleBatches}
                      <span class="expand-toggle">{expandedRows.has(globalIdx) ? "▼" : "▶"}</span>
                    {/if}
                    {globalIdx + 1}
                  </td>
                  <td class={mc.td}>{s ? reportStockTypeLabel(stockTypeKey(s)) : "—"}</td>
                  {#if dynamicFields.length > 0}
                    {#each dynamicFields as f}
                      <td class={mc.td}>{s ? stockAttr(s, f) : "—"}</td>
                    {/each}
                  {:else}
                    <td class={mc.td}>
                      {#if s && s.attributes && Object.keys(s.attributes).length > 0}
                        {orderStockAttrEntries(s)
                          .map(([k, v]) => `${attrLabel(k)}: ${v}`)
                          .join(" · ")}
                      {:else}
                        —
                      {/if}
                    </td>
                  {/if}
                  <td class={mc.td}>
                    {((item.unit ?? s?.unit ?? "").trim())
                      ? `${item.quantity} ${(item.unit ?? s?.unit ?? "").trim()}`
                      : String(item.quantity)}
                  </td>
                  <td class={mc.td}>{formatMoney(item.unit_price ?? s?.selling_price)}</td>
                  <td class="{mc.td} font-semibold">
                    {formatMoney(
                      item.line_total ??
                        Number(item.quantity ?? 0) * Number(item.unit_price ?? s?.selling_price ?? 0),
                    )}
                  </td>
                  <td class="{mc.td} text-gray-500 dark:text-gray-400">{s ? stockInvestorLabels(s) : "—"}</td>
                  <td class={mc.td}>
                    {#if !hasMultipleBatches && s}
                      <a class={mc.link} href="/stocks/{s.id}">View stock</a>
                    {/if}
                  </td>
                </tr>
                {#if hasMultipleBatches && expandedRows.has(globalIdx)}
                  {#each item.order_item_batches! as batch, bIdx}
                    {@const batchPrice = parseMoney(batch.stock?.selling_price ?? 0)}
                    {@const batchTotal = batch.quantity * batchPrice}
                    <tr class="batch-sub-row">
                      <td class={mc.colNum}></td>
                      <td class={mc.td} colspan={dynamicFields.length > 0 ? dynamicFields.length + 1 : 2}>
                        <span class="batch-label">
                          Batch #{bIdx + 1}
                          {#if batch.stock?.batch_number}
                            <span class="batch-number">({batch.stock.batch_number})</span>
                          {/if}
                        </span>
                      </td>
                      <td class={mc.td}>{batch.quantity}</td>
                      <td class={mc.td}>{formatMoney(batchPrice)}</td>
                      <td class="{mc.td} font-semibold">{formatMoney(batchTotal)}</td>
                      <td class={mc.td}></td>
                      <td class={mc.td}>
                        <a class={mc.link} href="/stocks/{batch.stock_id}">View stock</a>
                      </td>
                    </tr>
                  {/each}
                {/if}
              {/each}
            </tbody>
          </table>
          </div>
          <TablePagination
            bind:page={lineItemsPage}
            bind:pageSize={lineItemsPageSize}
            total={orderItems.length}
          />
        </section>
      {:else}
        <p class="text-sm text-gray-500 dark:text-gray-400">No stock details loaded for this order.</p>
      {/if}
    </div>
{:else}
    <p class="text-sm text-gray-500 dark:text-gray-400">Order not found.</p>
{/if}

  {#if showPay}
    <div
      class="modal-overlay"
      role="button"
      tabindex="0"
      onclick={() => !paymentFormPending && (showPay = false)}
      onkeydown={(e) =>
        !paymentFormPending &&
        (e.key === "Enter" || e.key === " ") &&
        (showPay = false)}
    ></div>
    <dialog
      open
      class="modal"
      onclick={(e) => e.stopPropagation()}
      oncancel={(e) => paymentFormPending && e.preventDefault()}
    >
      <header>
        <h2>Create Payment</h2>
        <button
          class="icon"
          aria-label="Close"
          disabled={paymentFormPending}
          onclick={() => (showPay = false)}>✕</button
        >
      </header>
      <form
        class="form"
        method="POST"
        action="?/createPayment"
        onsubmit={submitPayment}
        use:enhance={() => {
          paymentFormPending = true;
          return async ({ update, result }) => {
            try {
              await update();
            } finally {
              paymentFormPending = false;
            }
            const t = toastFromActionResult(result);
            if (t) showToast(t.message, t.variant);
            const ok =
              result.type === "success" &&
              result.data &&
              typeof result.data === "object" &&
              "success" in result.data &&
              (result.data as { success?: boolean }).success === true;
            if (ok) {
              successMessage = "";
              errorMessage = "";
              showPay = false;
              payAmount = undefined;
              payMethod = "";
              afterToast(TOAST_MS, () => window.location.reload());
            }
          };
        }}
      >
        <fieldset class="pay-form-fields" disabled={paymentFormPending}>
        <div class="grid">
          <label>
            <span class="label_text">Amount</span>
            <input
              type="number"
              name="amount"
              min="1"
              max={order?.outstanding_amount ?? undefined}
              bind:value={payAmount}
              required
            />
          </label>
          <label>
            <span class="label_text">Payment method</span>
            <select
              class="label_text"
              name="payment_method"
              bind:value={payMethod}
              required
            >
              <option value="">Select a bank</option>
              {#each banks as bank}
                <option value={bank}>{bank}</option>
              {/each}
            </select>
          </label>
        </div>
        {#if order}
          <div class="pay-summary">
            <p>Total: <strong>{formatMoney(order.total_amount)}</strong></p>
            <p>Outstanding: <strong>{formatMoney(order.outstanding_amount)}</strong></p>
            <p>
              Remaining after payment:
              <strong>{formatMoney(remainingAfterPay)}</strong>
            </p>
          </div>
        {/if}
        </fieldset>
        <footer>
          <button
            type="button"
            class="ghost"
            onclick={() => (showPay = false)}
            disabled={paymentFormPending}>Cancel</button
          >
          <button
            type="submit"
            class="primary"
            disabled={!payAmount || !payMethod || paymentFormPending}
            >{paymentFormPending ? "Creating…" : "Create"}</button
          >
        </footer>
      </form>
    </dialog>
  {/if}

<style>
  fieldset.pay-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 0.6rem 1rem;
    background: color-mix(in oklab, var(--surface-2), white 4%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .label {
    color: #94a3b8;
    font-weight: 700;
  }
  .chip {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
  }
  .chip.unpaid {
    background: rgba(239, 68, 68, 0.2);
  }
  .chip.partially\ paid {
    background: rgba(234, 179, 8, 0.2);
  }
  .chip.fully\ paid {
    background: rgba(34, 197, 94, 0.2);
  }
  .chip.ok {
    background: rgba(34, 197, 94, 0.2);
  }
  .chip.warn {
    background: rgba(234, 179, 8, 0.2);
  }
  .chip.bad {
    background: rgba(239, 68, 68, 0.2);
  }
  .chip.muted {
    background: color-mix(in oklab, #64748b, white 12%);
    color: #cbd5e1;
  }

  .primary {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    color: #0b1220;
    font-weight: 700;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 8px 20px rgba(59, 130, 246, 0.2);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: color-mix(in oklab, var(--surface-2), black 20%);
    border-color: color-mix(in oklab, var(--surface-2), black 30%);
    color: color-mix(in oklab, var(--text), black 40%);
    box-shadow: none;
  }
  .ghost {
    appearance: none;
    background: transparent;
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.6);
    backdrop-filter: blur(2px);
    z-index: 30;
  }
  .modal {
    position: fixed;
    inset: 0;
    margin: auto;
    max-width: 720px;
    width: calc(100% - 2rem);
    background: color-mix(in oklab, var(--surface), black 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.9rem;
    padding: 0;
    z-index: 40;
    color: #e5e7eb;
  }
  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .modal h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #f8fafc;
  }
  .modal .icon {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.1rem;
    cursor: pointer;
  }
  fieldset.pay-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .form {
    padding: 1rem;
  }
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.6rem;
    background: var(--surface-1);
    color: var(--text-1);
    font-size: 1rem;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--brand);
  }

  select option {
    background: var(--surface-1);
    color: var(--text-1);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.6rem;
    margin-bottom: 1rem;
  }
  .alert.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .alert.success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #86efac;
  }

  .label_text {
    color: #e5e7eb;
    font-weight: 700;
  }
  .pay-summary {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    font-size: 0.875rem;
    line-height: 1.75;
  }

  .expand-toggle {
    display: inline-block;
    width: 1.2em;
    cursor: pointer;
    user-select: none;
    font-size: 0.7rem;
  }
  .batch-sub-row td {
    padding-top: 0.25rem !important;
    padding-bottom: 0.25rem !important;
    font-size: 0.8rem;
  }
  .batch-sub-row {
    background: color-mix(in oklab, var(--surface-2), transparent 60%);
  }
  .batch-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .batch-number {
    opacity: 0.6;
    font-size: 0.75rem;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .data-table table {
      min-width: 720px;
    }
  }
</style>
