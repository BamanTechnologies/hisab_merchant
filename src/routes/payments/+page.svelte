<script lang="ts">
  import { goto } from "$app/navigation";
  import { navigating } from "$app/state";
  import { page } from "$app/stores";
  import TableLoading from "$lib/components/TableLoading.svelte";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSearchInput from "$lib/components/TableSearchInput.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import type { PageData } from "./$types";
  import { _ } from "svelte-i18n";

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

  let payments = $state((data.payments ?? []) as Payment[]);
  let totalCount = $state((data as { totalCount: number }).totalCount ?? 0);

  let searchQuery = $state($page.url.searchParams.get("search") ?? "");
  let customerFilterName = $state($page.url.searchParams.get("customer") ?? "");
  let dateRangePreset = $state(
    ($page.url.searchParams.get("dateRange") as "all" | "today" | "last7" | "last30" | "custom") ?? "all",
  );
  let customDateFrom = $state($page.url.searchParams.get("from") ?? "");
  let customDateTo = $state($page.url.searchParams.get("to") ?? "");
  let customDateFromInputEl = $state<HTMLInputElement | null>(null);
  let customDateToInputEl = $state<HTMLInputElement | null>(null);
  let sortColumn = $state<"none" | "date" | "amount" | "customer" | "method">(
    ($page.url.searchParams.get("sort") as "none" | "date" | "amount" | "customer" | "method") ?? "none",
  );
  let sortDirection = $state<"asc" | "desc">(
    ($page.url.searchParams.get("dir") as "asc" | "desc") ?? "desc",
  );
  let tablePage = $state(Number($page.url.searchParams.get("page")) || 1);
  let tablePageSize = $state(Number($page.url.searchParams.get("pageSize")) || 10);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressPageNav = $state(false);

  const customerFilterOptions = $derived(
    ((data as { customerNames?: string[] }).customerNames ?? []) as string[],
  );

  $effect(() => {
    payments = (data.payments ?? []) as Payment[];
    totalCount = (data as { totalCount: number }).totalCount ?? 0;
  });

  function allParamsFromState(): URLSearchParams {
    const p = new URLSearchParams();
    if (searchQuery) p.set("search", searchQuery);
    if (customerFilterName) p.set("customer", customerFilterName);
    if (dateRangePreset && dateRangePreset !== "all")
      p.set("dateRange", dateRangePreset);
    if (dateRangePreset === "custom") {
      if (customDateFrom) p.set("from", customDateFrom);
      if (customDateTo) p.set("to", customDateTo);
    }
    if (sortColumn && sortColumn !== "none") {
      p.set("sort", sortColumn);
      p.set("dir", sortDirection);
    }
    p.set("page", String(tablePage));
    p.set("pageSize", String(tablePageSize));
    return p;
  }

  function navigateWithState() {
    const params = allParamsFromState();
    const qs = params.toString();
    goto(qs ? `/payments?${qs}` : "/payments", { replaceState: true, keepFocus: true });
  }

  $effect(() => {
    const q = searchQuery;
    const currentSearch = $page.url.searchParams.get("search") ?? "";
    if (q === currentSearch) return;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      suppressPageNav = true;
      tablePage = 1;
      navigateWithState();
      suppressPageNav = false;
    }, 600);
  });

  $effect(() => {
    const dr = dateRangePreset;
    const cf = customerFilterName;
    const fd = customDateFrom;
    const td = customDateTo;
    const urlDr = $page.url.searchParams.get("dateRange") ?? "all";
    const urlCf = $page.url.searchParams.get("customer") ?? "";
    const urlFd = $page.url.searchParams.get("from") ?? "";
    const urlTd = $page.url.searchParams.get("to") ?? "";
    if (dr === urlDr && cf === urlCf && fd === urlFd && td === urlTd) return;

    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      if (suppressPageNav) return;
      tablePage = 1;
      navigateWithState();
    }, 600);
    return () => {
      if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    };
  });

  $effect(() => {
    if (suppressPageNav) return;
    const sc = sortColumn;
    const sd = sortDirection;
    const pg = tablePage;
    const ps = tablePageSize;
    const urlSort = $page.url.searchParams.get("sort") ?? "none";
    const urlDir = $page.url.searchParams.get("dir") ?? "desc";
    const urlPage = Number($page.url.searchParams.get("page")) || 1;
    const urlPageSize = Number($page.url.searchParams.get("pageSize")) || 10;
    if (sc === urlSort && sd === urlDir && pg === urlPage && ps === urlPageSize) return;
    navigateWithState();
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

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>{$_('pagePaymentsTitle')}</h1>
    <p class={mc.pageSubtitle}>{$_('pagePaymentsSubtitle')}</p>
  </div>
  <TableSearchInput bind:value={searchQuery} placeholder={$_('searchDots')} />
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
      {#if navigating.to}
        <TableLoading rows={2} cols={7} />
      {:else}
        {#each payments as p, i}
          <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
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
        {#if totalCount === 0}
          <tr>
            <td colspan="7" class={mc.emptyCell}>
              {searchQuery || dateRangePreset !== "all" || customerFilterName ? $_('noPaymentsFiltered') : $_('noPaymentsEmpty')}
            </td>
          </tr>
        {/if}
      {/if}
    </tbody>
  </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={totalCount}
    resetKey={totalCount}
  />
</section>
