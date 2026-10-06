<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import { DollarSign, ShoppingCart, Wallet, CreditCard } from "@lucide/svelte";
  import StatCard from "$lib/components/dashboard/StatCard.svelte";
  import WeeklySalesChart from "$lib/components/dashboard/WeeklySalesChart.svelte";
  import TopCustomersTable from "$lib/components/dashboard/TopCustomersTable.svelte";
  import UnpaidOrdersTable from "$lib/components/dashboard/UnpaidOrdersTable.svelte";
  import TopSellingProducts from "$lib/components/dashboard/TopSellingProducts.svelte";
  import RecentStocks from "$lib/components/dashboard/RecentStocks.svelte";
  import LowStockProducts from "$lib/components/dashboard/LowStockProducts.svelte";
  import { SearchSelect } from "$lib/components/ui/search-select";
  import { mc } from "$lib/merchant-styles";
  import { formatProductTypeLabel } from "$lib/stockLabel";
  import type { PageData } from "./$types";

  type SelectedProduct = { id: string; name?: string | null; default_unit?: string | null };

  let { data }: { data: PageData } = $props();

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const todayStr = now.toISOString().slice(0, 10);
  const initialFrom = $page.url.searchParams.get("from") ?? yearStart.toISOString().slice(0, 10);
  const initialTo = $page.url.searchParams.get("to") ?? todayStr;

  let dateFrom = $state(initialFrom);
  let dateTo = $state(initialTo);

  const initialGroupBy = $page.url.searchParams.get("groupBy") ?? "per_week";
  let groupPeriod = $state(initialGroupBy);

  // Seeded from the validated load, not the raw url, so a rejected param does not
// briefly render as an active filter.
  let productId = $state(data.productFilter.productId ?? "");
  let productTypeId = $state(data.productFilter.productTypeId ?? "");
  let selectedProduct = $state<SelectedProduct | null>(data.selectedProduct ?? null);

  // The load is the source of truth for both the label and which params survived
  // validation, so a shared link, a back/forward step, or a rejected param all land
  // on the same state the reports were actually fetched with.
  // Adopts a *new* load (shared link, back/forward, rejected param) so state lands
  // on what the reports were fetched with. Reads only `data`, so a fresh user pick
  // is never reverted by this effect racing the navigation it triggered.
  let appliedData: PageData = data;
  $effect(() => {
    const next = data;
    if (next === appliedData) return;
    appliedData = next;
    untrack(() => {
      productId = next.productFilter.productId ?? "";
      productTypeId = next.productFilter.productTypeId ?? "";
      selectedProduct = next.selectedProduct ?? null;
    });
  });

  // Deduplicated by name, matching the orders and stocks list pages: the same
  // logical type exists once per merchant with a different uuid, and the reports
  // filter on the shared name.
  const productTypeOptions = $derived.by(() => {
    const byName = new Map<string, { id: string; label: string }>();
    for (const pt of data.productTypes ?? []) {
      const name = String(pt?.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, { id: pt.id, label: formatProductTypeLabel(name) });
    }
    return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  const hasProductFilter = $derived(Boolean(productId || productTypeId));

  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Product picks refetch immediately, so cover the gap between the click and the
  // data actually landing instead of relying on the 600ms date debounce.
  let productNavPending = $state(false);
  const reportsLoading = $derived(loading || productNavPending);

  function clearProductFilters() {
    productId = "";
    productTypeId = "";
    selectedProduct = null;
  }

  function openDatePicker(el: HTMLInputElement | null) {
    if (!el) return;
    const input = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    el.focus();
    el.click();
  }

  let dateFromEl: HTMLInputElement | null = $state(null);
  let dateToEl: HTMLInputElement | null = $state(null);

  const userName = $derived("Merchant");

  function computePeriodDates(period: string): { from: string; to: string } {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);

    switch (period) {
      case "this_week": {
        const day = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        return { from: mon.toISOString().slice(0, 10), to };
      }
      case "last_week": {
        const day = today.getDay();
        const lastMon = new Date(today);
        lastMon.setDate(today.getDate() - (day === 0 ? 13 : day + 6));
        const lastSun = new Date(lastMon);
        lastSun.setDate(lastMon.getDate() + 6);
        return { from: lastMon.toISOString().slice(0, 10), to: lastSun.toISOString().slice(0, 10) };
      }
      case "last_2_weeks": {
        const from = new Date(today);
        from.setDate(today.getDate() - 13);
        return { from: from.toISOString().slice(0, 10), to };
      }
      case "this_month": {
        const from = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: from.toISOString().slice(0, 10), to };
      }
      default:
        return { from: "", to: "" };
    }
  }

  function detectPeriod(from: string, to: string): string {
    if (!from && !to) return "";
    const today = new Date().toISOString().slice(0, 10);
    if (to !== today) return "custom";
    const { from: wf, to: wt } = computePeriodDates("this_week");
    if (from === wf && to === wt) return "this_week";
    const { from: lf, to: lt } = computePeriodDates("last_week");
    if (from === lf && to === lt) return "last_week";
    const { from: tff, to: tft } = computePeriodDates("last_2_weeks");
    if (from === tff && to === tft) return "last_2_weeks";
    const { from: mf, to: mt } = computePeriodDates("this_month");
    if (from === mf && to === mt) return "this_month";
    return "custom";
  }

  let period = $state(detectPeriod(initialFrom, initialTo));

  function applyPeriod(p: string) {
    period = p;
    if (p === "custom") {
      dateFrom = yearStart.toISOString().slice(0, 10);
      dateTo = todayStr;
      return;
    }
    const { from, to } = computePeriodDates(p);
    dateFrom = from;
    dateTo = to;
  }

  function onDateInputChange() {
    const detected = detectPeriod(dateFrom, dateTo);
    if (detected !== period) {
      period = detected;
    }
  }

  function formatMoney(v: number): string {
    return `ETB ${v.toLocaleString()}`;
  }

  const salesTrend = $derived(data.salesTrend ?? []);
  const salesTrendTotal = $derived(salesTrend.reduce((sum, s) => sum + s.total_sales, 0));

  const stats = $derived([
    { value: formatMoney(data.totalSales), label: $_('dashboardTotalSales'), icon: DollarSign, iconBg: "bg-green-50 dark:bg-green-500/15", iconColor: "text-green-600 dark:text-green-400" },
    { value: String(data.totalOrders), label: $_('dashboardTotalOrders'), icon: ShoppingCart, iconBg: "bg-blue-50 dark:bg-blue-500/15", iconColor: "text-blue-600 dark:text-blue-400" },
    { value: formatMoney(data.pendingPayments), label: $_('dashboardPendingPayments'), icon: Wallet, iconBg: "bg-amber-50 dark:bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400" },
    { value: formatMoney(data.outstandingCredit), label: $_('dashboardOutstandingCredit'), icon: CreditCard, iconBg: "bg-red-50 dark:bg-red-500/15", iconColor: "text-red-600 dark:text-red-400" },
  ]);

  async function navigateWithDates() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (groupPeriod) params.set("groupBy", groupPeriod);
    if (productId) params.set("product_id", productId);
    if (productTypeId) params.set("product_type_id", productTypeId);
    const qs = params.toString();
    await goto(qs ? `/dashboard?${qs}` : "/dashboard", { replaceState: true, keepFocus: true });
  }

  $effect(() => {
    const df = dateFrom;
    const dt = dateTo;
    const urlFrom = $page.url.searchParams.get("from") ?? "";
    const urlTo = $page.url.searchParams.get("to") ?? "";
    if (df === urlFrom && dt === urlTo) return;

    clearTimeout(debounceTimer);
    loading = true;
    debounceTimer = setTimeout(() => {
      navigateWithDates();
      loading = false;
    }, 600);

    return () => clearTimeout(debounceTimer);
  });

  // Product / product type picks are discrete, so they refetch without the debounce.
  $effect(() => {
    const pid = productId;
    const ptid = productTypeId;
    const urlPid = $page.url.searchParams.get("product_id") ?? "";
    const urlPtid = $page.url.searchParams.get("product_type_id") ?? "";
    if (pid === urlPid && ptid === urlPtid) return;

    productNavPending = true;
    navigateWithDates().finally(() => {
      productNavPending = false;
    });
  });
</script>

<div class="space-y-6">
  <!-- Row 1: Welcome + Filters (From / To / Product / Product type) -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="font-[Sora] text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        {$_('dashboardWelcome', { values: { userName } })}
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$_('dashboardSubtitle')}</p>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
      <label class="flex items-center gap-2">
        <span class="shrink-0 whitespace-nowrap text-sm font-medium text-gray-500 dark:text-gray-400">{$_('from')}</span>
        <input
          class="h-8 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200 dark:[color-scheme:dark]"
          type="date"
          max={todayStr}
          bind:value={dateFrom}
          bind:this={dateFromEl}
          onclick={() => openDatePicker(dateFromEl)}
          onfocus={() => openDatePicker(dateFromEl)}
          onchange={onDateInputChange}
        />
      </label>

      <label class="flex items-center gap-2">
        <span class="shrink-0 whitespace-nowrap text-sm font-medium text-gray-500 dark:text-gray-400">{$_('to')}</span>
        <input
          class="h-8 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200 dark:[color-scheme:dark]"
          type="date"
          max={todayStr}
          bind:value={dateTo}
          bind:this={dateToEl}
          onclick={() => openDatePicker(dateToEl)}
          onfocus={() => openDatePicker(dateToEl)}
          onchange={onDateInputChange}
        />
      </label>

      <div class="{mc.tableToolbarFilter} h-8!">
        <label class={mc.tableToolbarFilterLabel} for="dashboard-product-filter">{$_('dashboardProductFilter')}</label>
        <div class="w-[13rem]">
          <SearchSelect
            id="dashboard-product-filter"
            bind:value={productId}
            bind:selected={selectedProduct}
            companyId={data.companyId ?? ''}
            branchId={data.branchId ?? ''}
            placeholder={$_('dashboardAllProducts')}
            disabled={!data.companyId}
          />
        </div>
      </div>

      <div class="{mc.tableToolbarFilter} h-8!">
        <label class={mc.tableToolbarFilterLabel} for="dashboard-product-type-filter">{$_('productType')}</label>
        <div class="w-[11rem]">
          <select
            id="dashboard-product-type-filter"
            class="{mc.filterSelect} h-8!"
            bind:value={productTypeId}
          >
            <option value="">{$_('dashboardAllProductTypes')}</option>
            {#each productTypeOptions as opt (opt.id)}
              <option value={opt.id}>{opt.label}</option>
            {/each}
          </select>
        </div>
      </div>

      {#if hasProductFilter}
        <button
          type="button"
          class="{mc.tableBtn} h-8!"
          onclick={clearProductFilters}
        >
          {$_('dashboardClearFilters')}
        </button>
      {/if}
    </div>
  </div>

  <!-- Row 2: Stat Cards -->
  <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
    {#each stats as stat}
      <StatCard
        value={stat.value}
        label={stat.label}
        icon={stat.icon}
        iconBg={stat.iconBg}
        iconColor={stat.iconColor}
        loading={reportsLoading}
      />
    {/each}
  </div>

  <!-- Row 3: Charts & Tables -->
  <div class="grid gap-6 grid-cols-1 lg:grid-cols-[63%_36%]">
    <!-- Left Column (65%) -->
    <div class="flex flex-col gap-6">
      <div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
        <div class="mb-4 flex flex-col md:flex-row flex-wrap md:items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-gray-100">{$_('dashboardWeeklySalesTitle')}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{$_('dashboardWeeklySalesTotal', { values: { amount: formatMoney(salesTrendTotal) } })}</p>
          </div>
          <div class="flex items-center gap-1">
            {#each ['per_day', 'per_week', 'per_month', 'per_year'] as g}
              <button
                class="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors {groupPeriod === g ? 'bg-[#4DA0E6] text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}"
                onclick={() => { groupPeriod = g; navigateWithDates(); }}
              >Per {g === 'per_day' ? 'Day' : g === 'per_week' ? 'Week' : g === 'per_month' ? 'Month' : 'Year'}</button>
            {/each}
          </div>
          <select
            class="merchant-filter-select h-[32px] rounded-lg border border-gray-200 bg-white py-0 pl-3 pr-8 text-sm font-medium text-gray-700 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200"
            value={period}
            onchange={(e) => applyPeriod((e.target as HTMLSelectElement).value)}
          >
            <option value="custom">{$_('dashboardCustomPeriod')}</option>
            <option value="this_week">{$_('dashboardThisWeek')}</option>
            <option value="last_week">{$_('dashboardLastWeek')}</option>
            <option value="last_2_weeks">{$_('dashboardLast2Weeks')}</option>
            <option value="this_month">{$_('dashboardThisMonth')}</option>
          </select>
        </div>
        <WeeklySalesChart data={salesTrend} loading={reportsLoading} groupPeriod={groupPeriod} />
      </div>

      <!-- Top Customers header -->
      <div class="flex items-center justify-between">
        <h3 class="font-bold capitalize text-lg text-gray-900 dark:text-gray-100">{$_('dashboardTopCustomers')}</h3>
        <a href="/customers" class="text-sm font-semibold text-[#4DA0E6] hover:underline">
          {$_('dashboardViewAll')} &rarr;
        </a>
      </div>

      <TopCustomersTable customers={data.topCustomers} loading={reportsLoading} />

      <!-- Unpaid Orders header -->
      <div class="flex items-center justify-between">
        <h3 class="font-bold capitalize text-lg text-gray-900 dark:text-gray-100">{$_('dashboardUnpaidOrders')}</h3>
        <a href="/orders" class="text-sm font-semibold text-[#4DA0E6] hover:underline">
          {$_('dashboardViewAll')} &rarr;
        </a>
      </div>

      <UnpaidOrdersTable orders={data.unpaidOrders} loading={reportsLoading} />
    </div>

    <!-- Right Column (35%) -->
    <div class="flex flex-col gap-6">
      <LowStockProducts products={data.lowStockProducts} loading={reportsLoading} />
      <TopSellingProducts products={data.topProducts} loading={reportsLoading} />
      <RecentStocks stocks={data.recentStocks} loading={reportsLoading} />
    </div>
  </div>
</div>
