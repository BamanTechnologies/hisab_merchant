<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { _ } from "svelte-i18n";
  import { DollarSign, ShoppingCart, Wallet, CreditCard } from "@lucide/svelte";
  import StatCard from "$lib/components/dashboard/StatCard.svelte";
  import WeeklySalesChart from "$lib/components/dashboard/WeeklySalesChart.svelte";
  import RecentPaymentsTable from "$lib/components/dashboard/RecentPaymentsTable.svelte";
  import TopSellingProducts from "$lib/components/dashboard/TopSellingProducts.svelte";
  import RecentStocks from "$lib/components/dashboard/RecentStocks.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const todayStr = now.toISOString().slice(0, 10);

  let dateFrom = $state($page.url.searchParams.get("from") ?? yearStart.toISOString().slice(0, 10));
  let dateTo = $state($page.url.searchParams.get("to") ?? todayStr);

  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

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

  function formatMoney(v: number): string {
    return `ETB ${v.toLocaleString()}`;
  }

  const stats = $derived([
    { value: formatMoney(data.totalSales), label: $_('dashboardTotalSales'), icon: DollarSign, iconBg: "bg-green-50 dark:bg-green-500/15", iconColor: "text-green-600 dark:text-green-400" },
    { value: String(data.totalOrders), label: $_('dashboardTotalOrders'), icon: ShoppingCart, iconBg: "bg-blue-50 dark:bg-blue-500/15", iconColor: "text-blue-600 dark:text-blue-400" },
    { value: formatMoney(data.pendingPayments), label: $_('dashboardPendingPayments'), icon: Wallet, iconBg: "bg-amber-50 dark:bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400" },
    { value: formatMoney(data.outstandingCredit), label: $_('dashboardOutstandingCredit'), icon: CreditCard, iconBg: "bg-red-50 dark:bg-red-500/15", iconColor: "text-red-600 dark:text-red-400" },
  ]);

  function navigateWithDates() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const qs = params.toString();
    goto(qs ? `/dashboard?${qs}` : "/dashboard", { replaceState: true, keepFocus: true });
  }

  $effect(() => {
    const df = dateFrom;
    const dt = dateTo;
    const urlFrom = $page.url.searchParams.get("from") ?? yearStart.toISOString().slice(0, 10);
    const urlTo = $page.url.searchParams.get("to") ?? now.toISOString().slice(0, 10);
    if (df === urlFrom && dt === urlTo) return;

    clearTimeout(debounceTimer);
    loading = true;
    debounceTimer = setTimeout(() => {
      navigateWithDates();
      loading = false;
    }, 600);

    return () => clearTimeout(debounceTimer);
  });
</script>

<div class="space-y-6">
  <!-- Row 1: Welcome + Date Selector -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="font-[Sora] text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        {$_('dashboardWelcome', { values: { userName } })}
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$_('dashboardSubtitle')}</p>
    </div>
    <div class="flex items-center gap-3">
      <label class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{$_('from')}</span>
        <input
          class="h-[34px] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200 dark:[color-scheme:dark]"
          type="date"
          max={todayStr}
          bind:value={dateFrom}
          bind:this={dateFromEl}
          onclick={() => openDatePicker(dateFromEl)}
          onfocus={() => openDatePicker(dateFromEl)}
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{$_('to')}</span>
        <input
          class="h-[34px] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200 dark:[color-scheme:dark]"
          type="date"
          max={todayStr}
          bind:value={dateTo}
          bind:this={dateToEl}
          onclick={() => openDatePicker(dateToEl)}
          onfocus={() => openDatePicker(dateToEl)}
        />
      </label>
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
        {loading}
      />
    {/each}
  </div>

  <!-- Row 3: Charts & Tables -->
  <div class="grid gap-6 lg:grid-cols-[63%_36%]">
    <!-- Left Column (65%) -->
    <div class="flex flex-col gap-6">
      <div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-gray-100">{$_('dashboardWeeklySalesTitle')}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{$_('dashboardWeeklySalesTotal', { values: { amount: '374,000' } })}</p>
          </div>
          <select
            class="merchant-filter-select h-[32px] rounded-lg border border-gray-200 bg-white py-0 pl-3 pr-8 text-sm font-medium text-gray-700 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20 dark:border-white/10 dark:bg-[#111827] dark:text-gray-200"
          >
            <option value="this_week">{$_('dashboardThisWeek')}</option>
            <option value="last_week">{$_('dashboardLastWeek')}</option>
            <option value="last_2_weeks">{$_('dashboardLast2Weeks')}</option>
            <option value="this_month">{$_('dashboardThisMonth')}</option>
          </select>
        </div>
        <WeeklySalesChart {loading} />
      </div>

      <!-- Recent Payments header (separate from table card) -->
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100">{$_('dashboardRecentPayments')}</h3>
        <a href="/payments" class="text-sm font-semibold text-[#4DA0E6] hover:underline">
          {$_('dashboardViewAll')} &rarr;
        </a>
      </div>

      <RecentPaymentsTable payments={data.recentPayments} {loading} />
    </div>

    <!-- Right Column (35%) -->
    <div class="flex flex-col gap-6">
      <TopSellingProducts products={data.topProducts} {loading} />
      <RecentStocks stocks={data.recentStocks} {loading} />
    </div>
  </div>
</div>
