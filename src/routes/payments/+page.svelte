<script lang="ts">
  import type { PageData } from "./$types";

  type Payment = {
    id: string;
    amount: number;
    created_by: string;
    created_by_name?: string;
    created_at?: string;
    order?: { customer_name?: string | null } | null;
    order_id: string;
    payment_method: string;
  };

  let { data }: { data: PageData } = $props();
  const payments = (data.payments ?? []) as Payment[];
  let dateRangePreset = $state<"all" | "today" | "last7" | "last30" | "custom">(
    "all",
  );
  let customerFilterName = $state("");
  let customDateFrom = $state("");
  let customDateTo = $state("");
  let customDateFromInputEl = $state<HTMLInputElement | null>(null);
  let customDateToInputEl = $state<HTMLInputElement | null>(null);
  let sortColumn = $state<"none" | "date" | "amount" | "customer" | "method">(
    "none",
  );
  let sortDirection = $state<"asc" | "desc">("asc");
  const customerFilterOptions = $derived.by(() => {
    const names = new Set<string>();
    for (const p of payments) {
      const n = String(p.order?.customer_name ?? "").trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });
  const filteredPayments = $derived.by(() => {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    const todayStart = startOfDay(now);
    const fromInputTs = customDateFrom ? startOfDay(new Date(customDateFrom)) : null;
    const toInputTs = customDateTo ? endOfDay(new Date(customDateTo)) : null;
    return payments.filter((p) => {
      if (
        customerFilterName &&
        String(p.order?.customer_name ?? "").trim() !== customerFilterName
      ) {
        return false;
      }
      const created = new Date(p.created_at ?? "").getTime();
      if (!Number.isFinite(created)) return false;
      if (dateRangePreset === "all") return true;
      if (dateRangePreset === "today") {
        return created >= todayStart && created <= endOfDay(now);
      }
      if (dateRangePreset === "last7") {
        const from = todayStart - 6 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (dateRangePreset === "last30") {
        const from = todayStart - 29 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (fromInputTs != null && created < fromInputTs) return false;
      if (toInputTs != null && created > toInputTs) return false;
      return true;
    });
  });
  const sortedPayments = $derived.by(() => {
    if (sortColumn === "none") return filteredPayments;
    return [...filteredPayments].sort((a, b) => {
      const av =
        sortColumn === "date"
          ? new Date(a.created_at ?? 0).getTime()
          : sortColumn === "amount"
            ? Number(a.amount ?? 0)
            : sortColumn === "customer"
              ? String(a.order?.customer_name ?? "").toLowerCase()
              : String(a.payment_method ?? "").toLowerCase();
      const bv =
        sortColumn === "date"
          ? new Date(b.created_at ?? 0).getTime()
          : sortColumn === "amount"
            ? Number(b.amount ?? 0)
            : sortColumn === "customer"
              ? String(b.order?.customer_name ?? "").toLowerCase()
              : String(b.payment_method ?? "").toLowerCase();
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  });
  function cycleSort(col: "date" | "amount" | "customer" | "method") {
    if (sortColumn !== col) {
      sortColumn = col;
      sortDirection = col === "date" ? "desc" : "asc";
      return;
    }
    if (sortDirection === "asc") sortDirection = "desc";
    else {
      sortColumn = "none";
      sortDirection = "asc";
    }
  }
  function isSortActive(col: "date" | "amount" | "customer" | "method", dir: "asc" | "desc") {
    return sortColumn === col && sortDirection === dir;
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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }
</script>

<section class="header">
  <div>
    <h1>Payments</h1>
    <p class="muted">Payment history and transaction records.</p>
  </div>
</section>

<section class="orders-filters" aria-label="Filter payments">
  <label class="filter-field">
    <span class="filter-label">Date range</span>
    <select class="native-select" bind:value={dateRangePreset}>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="last7">Last 7 days</option>
      <option value="last30">Last 30 days</option>
      <option value="custom">Custom range</option>
    </select>
  </label>

  {#if dateRangePreset === "custom"}
    <label class="filter-field">
      <span class="filter-label">From</span>
      <input
        class="native-select date-clickable"
        type="date"
        bind:value={customDateFrom}
        bind:this={customDateFromInputEl}
        onclick={() => openDatePicker(customDateFromInputEl)}
        onfocus={() => openDatePicker(customDateFromInputEl)}
      />
    </label>
    <label class="filter-field">
      <span class="filter-label">To</span>
      <input
        class="native-select date-clickable"
        type="date"
        bind:value={customDateTo}
        bind:this={customDateToInputEl}
        onclick={() => openDatePicker(customDateToInputEl)}
        onfocus={() => openDatePicker(customDateToInputEl)}
      />
    </label>
  {/if}

  <label class="filter-field">
    <span class="filter-label">Customer</span>
    <select class="native-select" bind:value={customerFilterName}>
      <option value="">All customers</option>
      {#each customerFilterOptions as customerName}
        <option value={customerName}>{customerName}</option>
      {/each}
    </select>
  </label>
</section>

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleSort("date")}>Date <span class="sort-arrows"><span class:sort-arrow-on={isSortActive("date","asc")}>▲</span><span class:sort-arrow-on={isSortActive("date","desc")}>▼</span></span></button></th>
        <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleSort("amount")}>Amount <span class="sort-arrows"><span class:sort-arrow-on={isSortActive("amount","asc")}>▲</span><span class:sort-arrow-on={isSortActive("amount","desc")}>▼</span></span></button></th>
        <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleSort("customer")}>Customer <span class="sort-arrows"><span class:sort-arrow-on={isSortActive("customer","asc")}>▲</span><span class:sort-arrow-on={isSortActive("customer","desc")}>▼</span></span></button></th>
        <th class="th-sort"><button type="button" class="sort-header-btn" onclick={() => cycleSort("method")}>Method <span class="sort-arrows"><span class:sort-arrow-on={isSortActive("method","asc")}>▲</span><span class:sort-arrow-on={isSortActive("method","desc")}>▼</span></span></button></th>
        <th>Created By</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedPayments as p, i}
        <tr class="row">
          <td class="col-num">{i + 1}</td>
          <td class="date">{p.created_at ? formatDate(p.created_at) : "—"}</td>
          <td class="amount">{formatMoney(p.amount)}</td>
          <td>{p.order?.customer_name?.trim() || "—"}</td>
          <td class="method">{p.payment_method}</td>
          <td class="date">{p.created_by_name || "—"}</td>
          <td>
            <a class="action-link" href={`/orders/${p.order_id}`}>View order</a>
          </td>
        </tr>
      {/each}
      {#if sortedPayments.length === 0}
        <tr>
          <td colspan="7" class="empty-state">
            <p class="muted">
              {payments.length === 0
                ? "No payments found. Payments will appear here once orders are paid."
                : "No payments match your current filters."}
            </p>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</section>

<style>
  h1 {
    margin: 0 0 0.25rem;
  }
  .muted {
    color: #94a3b8;
    margin: 0;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
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
  .amount {
    font-weight: 600;
  }
  .method {
    font-weight: 500;
  }
  .date {
    color: #94a3b8;
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
  .col-num {
    width: 2.25rem;
    white-space: nowrap;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
  .row {
    cursor: default;
  }
  .row:hover {
    background: color-mix(in oklab, var(--surface-2), white 6%);
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
  }
</style>
