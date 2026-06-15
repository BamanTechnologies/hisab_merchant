<script lang="ts">
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import { _ } from "svelte-i18n";
  import { paginateSlice } from "$lib/pagination.js";
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
  let tablePage = $state(1);
  let tablePageSize = $state(10);
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
  const paginationResetKey = $derived(
    `${dateRangePreset}|${customerFilterName}|${customDateFrom}|${customDateTo}|${sortColumn}|${sortDirection}`,
  );
  const pagedPayments = $derived(
    paginateSlice(sortedPayments, tablePage, tablePageSize),
  );
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

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>{$_('pagePaymentsTitle')}</h1>
    <p class={mc.pageSubtitle}>{$_('pagePaymentsSubtitle')}</p>
  </div>
</section>

<section class={mc.filterSection} aria-label="Filter payments">
  <label>
    <span class={mc.filterLabel}>{$_('dateRange')}</span>
    <select class={mc.filterSelect} bind:value={dateRangePreset}>
      <option value="all">{$_('allTime')}</option>
      <option value="today">{$_('today')}</option>
      <option value="last7">{$_('last7Days')}</option>
      <option value="last30">{$_('last30Days')}</option>
      <option value="custom">{$_('customRange')}</option>
    </select>
  </label>

  {#if dateRangePreset === "custom"}
    <label>
      <span class={mc.filterLabel}>{$_('from')}</span>
      <input
        class="{mc.filterDate} cursor-pointer"
        type="date"
        bind:value={customDateFrom}
        bind:this={customDateFromInputEl}
        onclick={() => openDatePicker(customDateFromInputEl)}
        onfocus={() => openDatePicker(customDateFromInputEl)}
      />
    </label>
    <label>
      <span class={mc.filterLabel}>{$_('to')}</span>
      <input
        class="{mc.filterDate} cursor-pointer"
        type="date"
        bind:value={customDateTo}
        bind:this={customDateToInputEl}
        onclick={() => openDatePicker(customDateToInputEl)}
        onfocus={() => openDatePicker(customDateToInputEl)}
      />
    </label>
  {/if}

  <label>
    <span class={mc.filterLabel}>{$_('customer')}</span>
    <select class={mc.filterSelect} bind:value={customerFilterName}>
      <option value="">{$_('allCustomers')}</option>
      {#each customerFilterOptions as customerName}
        <option value={customerName}>{customerName}</option>
      {/each}
    </select>
  </label>
</section>

<section class={mc.tableSection}>
  <div class="overflow-x-auto">
  <table class={mc.table}>
    <thead>
      <tr>
        <th class={mc.colNumHead}>{$_('number')}</th>
        <th class={mc.th}><TableSortHeader label={$_('date')} onclick={() => cycleSort("date")} ascActive={isSortActive("date","asc")} descActive={isSortActive("date","desc")} /></th>
        <th class={mc.th}><TableSortHeader label={$_('amount')} onclick={() => cycleSort("amount")} ascActive={isSortActive("amount","asc")} descActive={isSortActive("amount","desc")} /></th>
        <th class={mc.th}><TableSortHeader label={$_('customer')} onclick={() => cycleSort("customer")} ascActive={isSortActive("customer","asc")} descActive={isSortActive("customer","desc")} /></th>
        <th class={mc.th}><TableSortHeader label={$_('method')} onclick={() => cycleSort("method")} ascActive={isSortActive("method","asc")} descActive={isSortActive("method","desc")} /></th>
        <th class={mc.th}>{$_('createdBy')}</th>
        <th class={mc.thCenter}>{$_('actions')}</th>
      </tr>
    </thead>
    <tbody>
      {#each pagedPayments as p, i}
        <tr class="hover:bg-gray-50">
          <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
          <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{p.created_at ? formatDate(p.created_at) : "—"}</td>
          <td class="{mc.td} font-semibold">{formatMoney(p.amount)}</td>
          <td class={mc.td}>{p.order?.customer_name?.trim() || "—"}</td>
          <td class={mc.td}>{p.payment_method}</td>
          <td class="{mc.td} text-gray-500">{p.created_by_name || "—"}</td>
          <td class={mc.td}>
            <a class={mc.link} href={`/orders/${p.order_id}`}>{$_('viewOrder')}</a>
          </td>
        </tr>
      {/each}
      {#if sortedPayments.length === 0}
        <tr>
          <td colspan="7" class={mc.emptyCell}>
              {payments.length === 0
                ? $_('noPaymentsEmpty')
                : $_('noPaymentsFiltered')}
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={sortedPayments.length}
    resetKey={paginationResetKey}
  />
</section>
