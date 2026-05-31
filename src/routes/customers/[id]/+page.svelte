<script lang="ts">
  import { goto } from "$app/navigation";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import SummaryMetricCard from "$lib/components/SummaryMetricCard.svelte";
  import { mc, statusChipClass } from "$lib/merchant-styles.js";
  import { paginateSlice } from "$lib/pagination.js";
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
  let ordersTablePage = $state(1);
  let ordersTablePageSize = $state(10);
  let paymentsTablePage = $state(1);
  let paymentsTablePageSize = $state(10);

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
  const pagedOrders = $derived(
    paginateSlice(sortedOrders, ordersTablePage, ordersTablePageSize),
  );
  const pagedPayments = $derived(
    paginateSlice(sortedPayments, paymentsTablePage, paymentsTablePageSize),
  );
  const customerActivityResetKey = $derived(
    `${tab}|${customerDateRangePreset}|${customerDateFrom}|${customerDateTo}|${orderSortColumn}|${orderSortDirection}|${paymentSortColumn}|${paymentSortDirection}`,
  );
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

  function stockName(o: CustomerDetailOrder): string {
    if (o.stock_name && o.stock_name.trim() !== "") return o.stock_name;
    const s = o.stock;
    if (!s) return o.stock_id.slice(0, 8) + "…";
    return buildStockLabel(s);
  }
  function stockNameParts(name: string): { base: string; more: string } {
    const trimmed = name.trim();
    const m = trimmed.match(/^(.*)\s\+(\d+)\s+more$/i);
    if (!m) return { base: trimmed, more: "" };
    return { base: m[1].trim(), more: `+ ${m[2]} More` };
  }
  function stockNameBase(name: string): string {
    return stockNameParts(name).base;
  }
  function stockNameMore(name: string): string {
    return stockNameParts(name).more;
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

<button
  type="button"
  class="mb-4 text-sm font-semibold text-[#4DA0E6] hover:underline"
  onclick={() => goto("/customers")}
>
  ← Customers
</button>

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

<header class="mb-6">
  <h1 class={mc.pageTitle}>{fullName()}</h1>
  {#if data.customer.phone_number}
    <p class={mc.pageSubtitle}>{data.customer.phone_number}</p>
  {/if}
  {#if data.customer.address}
    <p class="mt-1 text-sm text-gray-500">{data.customer.address}</p>
  {/if}
</header>

<section class={mc.summaryGrid} aria-label="Customer summary">
  <SummaryMetricCard
    value={formatMoney(data.totalOrderAmount)}
    label="Total orders"
    icon="two"
  />
  <SummaryMetricCard
    value={formatMoney(data.totalPaymentAmount)}
    label="Cash & bank paid in"
    icon="five"
  />
  <SummaryMetricCard
    value={formatMoney(balanceSummary.displayAmount)}
    label={balanceSummary.isOverpaid ? "Overpaid" : "Outstanding"}
    icon="one"
  />
</section>

<div
  class="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
  role="tablist"
  aria-label="Customer activity"
>
  <button
    type="button"
    role="tab"
    class="rounded-md px-4 py-2 text-sm font-semibold transition {tab === 'orders'
      ? 'bg-[#4DA0E6] text-white'
      : 'text-gray-600 hover:bg-gray-50'}"
    aria-selected={tab === "orders"}
    onclick={() => (tab = "orders")}>Total orders</button
  >
  <button
    type="button"
    role="tab"
    class="rounded-md px-4 py-2 text-sm font-semibold transition {tab === 'payments'
      ? 'bg-[#4DA0E6] text-white'
      : 'text-gray-600 hover:bg-gray-50'}"
    aria-selected={tab === "payments"}
    onclick={() => (tab = "payments")}>Total payments</button
  >
</div>

<section class={mc.filterSection} aria-label="Filter customer activity by date">
  <label>
    <span class={mc.filterLabel}>Date range</span>
    <select class={mc.filterSelect} bind:value={customerDateRangePreset}>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="last7">Last 7 days</option>
      <option value="last30">Last 30 days</option>
      <option value="custom">Custom range</option>
    </select>
  </label>
  {#if customerDateRangePreset === "custom"}
    <label>
      <span class={mc.filterLabel}>From</span>
      <input
        class="{mc.filterDate} cursor-pointer"
        type="date"
        bind:value={customerDateFrom}
        bind:this={customerDateFromInputEl}
        onclick={() => openDatePicker(customerDateFromInputEl)}
        onfocus={() => openDatePicker(customerDateFromInputEl)}
      />
    </label>
    <label>
      <span class={mc.filterLabel}>To</span>
      <input
        class="{mc.filterDate} cursor-pointer"
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
  <section class={mc.tableSection}>
    <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>#</th>
          <th class={mc.th}><TableSortHeader label="Date" onclick={() => cycleOrderSort("date")} ascActive={isOrderSortActive("date","asc")} descActive={isOrderSortActive("date","desc")} /></th>
          <th class={mc.th}><TableSortHeader label="Stocks (Item)" onclick={() => cycleOrderSort("stock")} ascActive={isOrderSortActive("stock","asc")} descActive={isOrderSortActive("stock","desc")} /></th>
          <th class={mc.thCenter}><TableSortHeader label="Quantity" align="center" onclick={() => cycleOrderSort("quantity")} ascActive={isOrderSortActive("quantity","asc")} descActive={isOrderSortActive("quantity","desc")} /></th>
          <th class={mc.th}><TableSortHeader label="Status" onclick={() => cycleOrderSort("status")} ascActive={isOrderSortActive("status","asc")} descActive={isOrderSortActive("status","desc")} /></th>
          <th class={mc.th}><TableSortHeader label="Total amount" onclick={() => cycleOrderSort("total")} ascActive={isOrderSortActive("total","asc")} descActive={isOrderSortActive("total","desc")} /></th>
        </tr>
      </thead>
      <tbody>
        {#each pagedOrders as o, i}
          <tr
            class={mc.rowClickable}
            onclick={() => goto(`/orders/${o.id}`)}
            tabindex="0"
            role="button"
          >
            <td class={mc.colNum}>{(ordersTablePage - 1) * ordersTablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{formatOrderDate(o.created_at)}</td>
            <td class={mc.td}>
              {stockNameBase(stockName(o))}
              {#if stockNameMore(stockName(o))}
                <span class="font-semibold text-[#4DA0E6]"> {stockNameMore(stockName(o))}</span>
              {/if}
            </td>
            <td class="{mc.tdCenter} whitespace-nowrap">{orderQtyCell(o)}</td>
            <td class={mc.td}><span class={statusChipClass(o.status)}>{o.status}</span></td>
            <td class="{mc.td} font-semibold">{formatMoney(o.total_amount)}</td>
          </tr>
        {/each}
        {#if sortedOrders.length === 0}
          <tr>
            <td colspan="6" class={mc.emptyCell}>
                {orders.length === 0
                  ? "No orders for this customer in your company."
                  : "No orders match your selected date range."}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
    </div>
    <TablePagination
      bind:page={ordersTablePage}
      bind:pageSize={ordersTablePageSize}
      total={sortedOrders.length}
      resetKey={customerActivityResetKey}
    />
  </section>
{:else}
  <section class={mc.tableSection}>
    <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>#</th>
          <th class={mc.th}><TableSortHeader label="Date" onclick={() => cyclePaymentSort("date")} ascActive={isPaymentSortActive("date","asc")} descActive={isPaymentSortActive("date","desc")} /></th>
          <th class={mc.th}><TableSortHeader label="Amount" onclick={() => cyclePaymentSort("amount")} ascActive={isPaymentSortActive("amount","asc")} descActive={isPaymentSortActive("amount","desc")} /></th>
          <th class={mc.th}><TableSortHeader label="Method" onclick={() => cyclePaymentSort("method")} ascActive={isPaymentSortActive("method","asc")} descActive={isPaymentSortActive("method","desc")} /></th>
          <th class={mc.th}>Created By</th>
          <th class={mc.thCenter}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedPayments as p, i}
          <tr class="hover:bg-gray-50">
            <td class={mc.colNum}>{(paymentsTablePage - 1) * paymentsTablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{p.created_at ? formatOrderDate(p.created_at) : "—"}</td>
            <td class="{mc.td} font-semibold">{formatMoney(p.amount)}</td>
            <td class={mc.td}>{p.payment_method}</td>
            <td class="{mc.td} text-gray-500">{p.created_by_name || "—"}</td>
            <td class={mc.td}>
              <a class={mc.link} href={`/orders/${p.order_id}`}>View order</a>
            </td>
          </tr>
        {/each}
        {#if sortedPayments.length === 0}
          <tr>
            <td colspan="6" class={mc.emptyCell}>
                {payments.length === 0
                  ? "No payments linked to this customer’s orders."
                  : "No payments match your selected date range."}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
    </div>
    <TablePagination
      bind:page={paymentsTablePage}
      bind:pageSize={paymentsTablePageSize}
      total={sortedPayments.length}
      resetKey={customerActivityResetKey}
    />
  </section>
{/if}
