<script lang="ts">
  import { goto } from "$app/navigation";
  import { buildStockLabel } from "$lib/stockLabel";
  import type { PageData } from "./$types";
  import type { CustomerDetailOrder } from "./+page.server";

  let { data }: { data: PageData } = $props();
  const payments = data.payments as Array<{
    created_at?: string;
    amount: number | string;
    payment_method: string;
    created_by_name?: string;
    order_id: string;
  }>;
  let paymentSortColumn = $state<"none" | "date" | "amount" | "method">("none");
  let paymentSortDirection = $state<"asc" | "desc">("asc");
  let customerDateRangePreset = $state<
    "all" | "today" | "last7" | "last30" | "custom"
  >("all");
  let customerDateFrom = $state("");
  let customerDateTo = $state("");
  let customerDateFromInputEl = $state<HTMLInputElement | null>(null);
  let customerDateToInputEl = $state<HTMLInputElement | null>(null);

  const sortedPayments = $derived.by(() => {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const todayStart = startOfDay(now);
    const fromInputTs = customerDateFrom ? startOfDay(new Date(customerDateFrom)) : null;
    const toInputTs = customerDateTo ? endOfDay(new Date(customerDateTo)) : null;
    const filtered = payments.filter((p) => {
      const created = new Date(p.created_at ?? "").getTime();
      if (!Number.isFinite(created)) return false;
      if (customerDateRangePreset === "all") return true;
      if (customerDateRangePreset === "today") {
        return created >= todayStart && created <= endOfDay(now);
      }
      if (customerDateRangePreset === "last7") {
        const from = todayStart - 6 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (customerDateRangePreset === "last30") {
        const from = todayStart - 29 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (fromInputTs != null && created < fromInputTs) return false;
      if (toInputTs != null && created > toInputTs) return false;
      return true;
    });
    if (paymentSortColumn === "none") return filtered;
    return [...filtered].sort((a, b) => {
      const av =
        paymentSortColumn === "date"
          ? new Date(a.created_at ?? 0).getTime()
          : paymentSortColumn === "amount"
            ? Number(a.amount ?? 0)
            : String(a.payment_method ?? "").toLowerCase();
      const bv =
        paymentSortColumn === "date"
          ? new Date(b.created_at ?? 0).getTime()
          : paymentSortColumn === "amount"
            ? Number(b.amount ?? 0)
            : String(b.payment_method ?? "").toLowerCase();
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return paymentSortDirection === "asc" ? cmp : -cmp;
    });
  });

  /** Same convention as server `outstandingAmount`: positive = owes, negative = credit / overpaid (ledger). */
  const balanceSummary = $derived.by(() => {
    const ledger = Number(data.outstandingAmount);
    const n = Number.isFinite(ledger) ? ledger : 0;
    const overpaid = n < 0;
    return {
      isOverpaid: overpaid,
      displayAmount: overpaid ? Math.abs(n) : n,
    };
  });

  type Tab = "orders" | "payments";
  let tab = $state<Tab>("orders");
  let orders = $state([] as CustomerDetailOrder[]);
  let orderSortColumn = $state<
    "none" | "date" | "stock" | "quantity" | "status" | "total"
  >("none");
  let orderSortDirection = $state<"asc" | "desc">("asc");
  const filteredOrders = $derived.by(() => {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const todayStart = startOfDay(now);
    const fromInputTs = customerDateFrom ? startOfDay(new Date(customerDateFrom)) : null;
    const toInputTs = customerDateTo ? endOfDay(new Date(customerDateTo)) : null;
    return orders.filter((o) => {
      const created = new Date(o.created_at ?? "").getTime();
      if (!Number.isFinite(created)) return false;
      if (customerDateRangePreset === "all") return true;
      if (customerDateRangePreset === "today") {
        return created >= todayStart && created <= endOfDay(now);
      }
      if (customerDateRangePreset === "last7") {
        const from = todayStart - 6 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (customerDateRangePreset === "last30") {
        const from = todayStart - 29 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (fromInputTs != null && created < fromInputTs) return false;
      if (toInputTs != null && created > toInputTs) return false;
      return true;
    });
  });
  const sortedOrders = $derived.by(() => {
    if (orderSortColumn === "none") return filteredOrders;
    return [...filteredOrders].sort((a, b) => {
      const av =
        orderSortColumn === "date"
          ? new Date(a.created_at ?? 0).getTime()
          : orderSortColumn === "stock"
            ? stockName(a).toLowerCase()
            : orderSortColumn === "quantity"
              ? Number(a.order_quantity ?? 0)
              : orderSortColumn === "status"
                ? String(a.status ?? "").toLowerCase()
                : Number(a.total_amount ?? 0);
      const bv =
        orderSortColumn === "date"
          ? new Date(b.created_at ?? 0).getTime()
          : orderSortColumn === "stock"
            ? stockName(b).toLowerCase()
            : orderSortColumn === "quantity"
              ? Number(b.order_quantity ?? 0)
              : orderSortColumn === "status"
                ? String(b.status ?? "").toLowerCase()
                : Number(b.total_amount ?? 0);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return orderSortDirection === "asc" ? cmp : -cmp;
    });
  });
  let errorMessage = $state("");
  let successMessage = $state("");

  $effect(() => {
    orders = data.orders;
  });

  function fullName() {
    const parts = [data.customer.first_name, data.customer.last_name].filter(
      Boolean,
    );
    return parts.join(" ").trim() || "Customer";
  }

  function formatOrderDate(iso: string) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
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

  function orderQtyCell(o: CustomerDetailOrder) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    const q = o.order_quantity;
    return u ? `${q} ${u}` : String(q);
  }

  function statusClass(status: string) {
    if (status === "cancelled") return "muted";
    if (status === "paid") return "ok";
    if (status === "partially_paid") return "warn";
    return "bad";
  }
  function stockName(o: CustomerDetailOrder): string {
    if (o.stock_name && o.stock_name.trim() !== "") return o.stock_name;
    const s = o.stock;
    if (!s) return o.stock_id.slice(0, 8) + "…";
    return buildStockLabel(s);
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }
  function cycleOrderSort(
    col: "date" | "stock" | "quantity" | "status" | "total",
  ) {
    if (orderSortColumn !== col) {
      orderSortColumn = col;
      orderSortDirection = col === "date" ? "desc" : "asc";
      return;
    }
    if (orderSortDirection === "asc") orderSortDirection = "desc";
    else {
      orderSortColumn = "none";
      orderSortDirection = "asc";
    }
  }
  function isOrderSortActive(
    col: "date" | "stock" | "quantity" | "status" | "total",
    dir: "asc" | "desc",
  ) {
    return orderSortColumn === col && orderSortDirection === dir;
  }
  function cyclePaymentSort(col: "date" | "amount" | "method") {
    if (paymentSortColumn !== col) {
      paymentSortColumn = col;
      paymentSortDirection = col === "date" ? "desc" : "asc";
      return;
    }
    if (paymentSortDirection === "asc") paymentSortDirection = "desc";
    else {
      paymentSortColumn = "none";
      paymentSortDirection = "asc";
    }
  }
  function isPaymentSortActive(col: "date" | "amount" | "method", dir: "asc" | "desc") {
    return paymentSortColumn === col && paymentSortDirection === dir;
  }
  function openDatePicker(el: HTMLInputElement | null) {
    if (!el) return;
    const inputWithPicker = el as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (typeof inputWithPicker.showPicker === "function") {
      inputWithPicker.showPicker();
      return;
    }
    el.focus();
    el.click();
  }
</script>

<section class="back-row">
  <button type="button" class="linkish" onclick={() => goto("/customers")}
    >← Customers</button
  >
</section>

{#if errorMessage}
  <div class="alert error">
    <p>{errorMessage}</p>
  </div>
{/if}

{#if successMessage}
  <div class="alert success">
    <p>{successMessage}</p>
  </div>
{/if}

<header class="hero">
  <h1>{fullName()}</h1>
  {#if data.customer.phone_number}
    <p class="sub">{data.customer.phone_number}</p>
  {/if}
  {#if data.customer.address}
    <p class="sub muted">{data.customer.address}</p>
  {/if}
</header>

<section class="summary">
  <div class="metric">
    <span class="label">Total orders</span>
    <span class="value">{formatMoney(data.totalOrderAmount)}</span>
  </div>
  <div class="metric">
    <span class="label">Cash &amp; bank paid in</span>
    <span class="value pay">{formatMoney(data.totalPaymentAmount)}</span>
  </div>
  <div
    class="metric highlight"
    class:metric-overpaid={balanceSummary.isOverpaid}
  >
    <span class="label"
      >{balanceSummary.isOverpaid ? "Overpaid" : "Outstanding"}</span
    >
    <span
      class="value"
      class:out={!balanceSummary.isOverpaid}
      class:overpaid={balanceSummary.isOverpaid}
      >{formatMoney(balanceSummary.displayAmount)}</span
    >
  </div>
</section>

<div class="tabs" role="tablist" aria-label="Customer activity">
  <button
    type="button"
    role="tab"
    class:active={tab === "orders"}
    aria-selected={tab === "orders"}
    onclick={() => (tab = "orders")}>Total orders</button
  >
  <button
    type="button"
    role="tab"
    class:active={tab === "payments"}
    aria-selected={tab === "payments"}
    onclick={() => (tab = "payments")}>Total payments</button
  >
</div>

<section class="orders-filters" aria-label="Filter customer activity by date">
  <label class="filter-field">
    <span class="filter-label">Date range</span>
    <select class="native-select" bind:value={customerDateRangePreset}>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="last7">Last 7 days</option>
      <option value="last30">Last 30 days</option>
      <option value="custom">Custom range</option>
    </select>
  </label>
  {#if customerDateRangePreset === "custom"}
    <label class="filter-field">
      <span class="filter-label">From</span>
      <input
        class="native-select date-clickable"
        type="date"
        bind:value={customerDateFrom}
        bind:this={customerDateFromInputEl}
        onclick={() => openDatePicker(customerDateFromInputEl)}
        onfocus={() => openDatePicker(customerDateFromInputEl)}
      />
    </label>
    <label class="filter-field">
      <span class="filter-label">To</span>
      <input
        class="native-select date-clickable"
        type="date"
        bind:value={customerDateTo}
        bind:this={customerDateToInputEl}
        onclick={() => openDatePicker(customerDateToInputEl)}
        onfocus={() => openDatePicker(customerDateToInputEl)}
      />
    </label>
  {/if}
</section>

{#if tab === "orders"}
  <section class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleOrderSort("date")}>Date <span class="sort-arrows"><span class:sort-arrow-on={isOrderSortActive("date","asc")}>▲</span><span class:sort-arrow-on={isOrderSortActive("date","desc")}>▼</span></span></button></th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleOrderSort("stock")}>Stock <span class="sort-arrows"><span class:sort-arrow-on={isOrderSortActive("stock","asc")}>▲</span><span class:sort-arrow-on={isOrderSortActive("stock","desc")}>▼</span></span></button></th>
          <th class="right th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleOrderSort("quantity")}>Quantity <span class="sort-arrows"><span class:sort-arrow-on={isOrderSortActive("quantity","asc")}>▲</span><span class:sort-arrow-on={isOrderSortActive("quantity","desc")}>▼</span></span></button></th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleOrderSort("status")}>Status <span class="sort-arrows"><span class:sort-arrow-on={isOrderSortActive("status","asc")}>▲</span><span class:sort-arrow-on={isOrderSortActive("status","desc")}>▼</span></span></button></th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleOrderSort("total")}>Total amount <span class="sort-arrows"><span class:sort-arrow-on={isOrderSortActive("total","asc")}>▲</span><span class:sort-arrow-on={isOrderSortActive("total","desc")}>▼</span></span></button></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedOrders as o, i}
          <tr
            class="row"
            onclick={() => goto(`/orders/${o.id}`)}
            tabindex="0"
            role="button"
          >
            <td class="col-num">{i + 1}</td>
            <td class="nowrap">{formatOrderDate(o.created_at)}</td>
            <td>{stockName(o)}</td>
            <td class="right">{orderQtyCell(o)}</td>
            <td><span class="chip {statusClass(o.status)}">{o.status}</span></td
            >
            <td>{formatMoney(o.total_amount)}</td>
          </tr>
        {/each}
        {#if sortedOrders.length === 0}
          <tr>
            <td colspan="6" class="empty-state">
              <p class="muted">
                {orders.length === 0
                  ? "No orders for this customer in your company."
                  : "No orders match your selected date range."}
              </p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </section>
{:else}
  <section class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cyclePaymentSort("date")}>Date <span class="sort-arrows"><span class:sort-arrow-on={isPaymentSortActive("date","asc")}>▲</span><span class:sort-arrow-on={isPaymentSortActive("date","desc")}>▼</span></span></button></th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cyclePaymentSort("amount")}>Amount <span class="sort-arrows"><span class:sort-arrow-on={isPaymentSortActive("amount","asc")}>▲</span><span class:sort-arrow-on={isPaymentSortActive("amount","desc")}>▼</span></span></button></th>
          <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cyclePaymentSort("method")}>Method <span class="sort-arrows"><span class:sort-arrow-on={isPaymentSortActive("method","asc")}>▲</span><span class:sort-arrow-on={isPaymentSortActive("method","desc")}>▼</span></span></button></th>
          <th>Created By</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each sortedPayments as p, i}
          <tr class="row">
            <td class="col-num">{i + 1}</td>
            <td class="date">{p.created_at ? formatOrderDate(p.created_at) : "—"}</td>
            <td class="amount">{formatMoney(p.amount)}</td>
            <td class="method">{p.payment_method}</td>
            <td class="date">{p.created_by_name || "—"}</td>
            <td>
              <a class="action-link" href={`/orders/${p.order_id}`}>View order</a>
            </td>
          </tr>
        {/each}
        {#if sortedPayments.length === 0}
          <tr>
            <td colspan="6" class="empty-state">
              <p class="muted">
                {payments.length === 0
                  ? "No payments linked to this customer’s orders."
                  : "No payments match your selected date range."}
              </p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .back-row {
    margin-bottom: 0.75rem;
  }
  .linkish {
    appearance: none;
    background: none;
    border: none;
    color: #60a5fa;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .linkish:hover {
    text-decoration: underline;
  }
  .hero h1 {
    margin: 0 0 0.35rem;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 0.15rem 0 0;
  }
  .muted {
    color: #94a3b8;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin: 1.25rem 0 1rem;
  }
  .metric {
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    background: color-mix(in oklab, var(--surface-2), white 3%);
  }
  .metric.highlight {
    border-color: color-mix(in oklab, #f59e0b, transparent 60%);
    background: color-mix(in oklab, #f59e0b, transparent 88%);
  }
  .metric.highlight.metric-overpaid {
    border-color: color-mix(in oklab, #38bdf8, transparent 55%);
    background: color-mix(in oklab, #38bdf8, transparent 90%);
  }
  .label {
    display: block;
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.35rem;
  }
  .value {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .value.pay {
    color: #4ade80;
  }
  .value.out {
    color: #fbbf24;
  }
  .value.overpaid {
    color: #7dd3fc;
  }
  .tabs {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .tabs button {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 4%);
    color: #cbd5e1;
    padding: 0.45rem 0.9rem;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button:hover {
    background: color-mix(in oklab, var(--surface-2), white 8%);
  }
  .tabs button.active {
    background: var(--brand, #3b82f6);
    color: #0b1220;
    border-color: transparent;
  }
  .orders-filters {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: end;
    margin: 0 0 0.85rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.7rem;
    background: color-mix(in oklab, var(--surface-2), white 2%);
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 11.5rem;
  }
  .filter-label {
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;
    font-weight: 700;
  }
  .native-select {
    appearance: none;
    padding: 0.55rem 0.65rem;
    border-radius: 0.6rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 4%);
    color: #e2e8f0;
    font: inherit;
  }
  .date-clickable {
    cursor: pointer;
  }
  .table-wrap {
    overflow: auto;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead tr {
    background: color-mix(in oklab, var(--surface-2), white 4%);
  }
  th,
  td {
    padding: 0.75rem 0.75rem;
  }
  th {
    text-align: left;
    color: #94a3b8;
    font-weight: 700;
    font-size: 0.9rem;
  }
  th.right,
  td.right {
    text-align: right;
  }
  .nowrap {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
  .row {
    cursor: pointer;
  }
  .row:hover {
    background: color-mix(in oklab, var(--surface-2), white 6%);
  }
  .chip {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    background: color-mix(in oklab, var(--surface-2), white 10%);
  }
  .chip.ok {
    background: color-mix(in oklab, #10b981, white 20%);
    color: #064e3b;
  }
  .chip.warn {
    background: color-mix(in oklab, #f59e0b, white 20%);
    color: #92400e;
  }
  .chip.bad {
    background: color-mix(in oklab, #ef4444, white 20%);
    color: #991b1b;
  }
  .chip.muted {
    background: color-mix(in oklab, #64748b, white 12%);
    color: #cbd5e1;
  }
  .amount {
    font-weight: 600;
  }
  .method {
    font-weight: 500;
  }
  .date {
    color: #94a3b8;
  }
  .col-num {
    width: 2.25rem;
    white-space: nowrap;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .th-sort {
    padding: 0.35rem 0.5rem;
    vertical-align: middle;
  }
  .sort-header-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    margin: 0;
    padding: 0.35rem 0.4rem;
    border: none;
    border-radius: 0.45rem;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
  }
  .sort-arrows {
    display: inline-flex;
    flex-direction: column;
    line-height: 0.8;
    font-size: 0.6rem;
    opacity: 0.45;
  }
  .sort-arrow-on {
    opacity: 1;
    color: #cbd5e1;
  }
  .action-link {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.65rem;
    border-radius: 0.45rem;
    border: 1px solid color-mix(in oklab, #60a5fa, white 35%);
    color: #60a5fa;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.86rem;
    transition: background-color 120ms ease;
  }
  .action-link:hover {
    background: color-mix(in oklab, #60a5fa, transparent 88%);
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
  }

  .alert {
    margin: 0 0 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }
  .alert.error {
    border-color: #f87171;
    background: color-mix(in oklab, #ef4444, transparent 88%);
    color: #fecaca;
  }
  .alert.success {
    border-color: #4ade80;
    background: color-mix(in oklab, #22c55e, transparent 88%);
    color: #bbf7d0;
  }
  .alert p {
    margin: 0;
  }
</style>
