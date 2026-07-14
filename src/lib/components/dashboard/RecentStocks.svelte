<script lang="ts">
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { Package } from "@lucide/svelte";

  type Stock = {
    stock_id: string;
    name: string;
    quantity: number;
    unit: string;
    date: string;
  };

  type Props = {
    stocks: Stock[];
    loading?: boolean;
  };

  let { stocks, loading = false }: Props = $props();

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
    <div class="flex items-center gap-3">
      <div class="flex size-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/15">
        <Package size={20} class="text-blue-600 dark:text-blue-400" />
      </div>
      <h3 class="text-base font-bold capitalize tracking-wide text-gray-900 dark:text-gray-100">{$_('dashboardRecentStocks')}</h3>
    </div>
  </div>
  <div class="divide-y divide-gray-50 dark:divide-white/5">
    {#if loading}
      {#each Array(5) as _}
        <div class="flex items-center justify-between px-5 py-3.5">
          <div class="space-y-1.5">
            <div class="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            <div class="h-3 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
          </div>
          <div class="h-3 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
        </div>
      {/each}
    {:else if stocks.length === 0}
      <div class="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
        <Package size={40} class="text-gray-300 dark:text-gray-600" />
        <span>{$_('dashboardNoRecentStocks')}</span>
      </div>
    {:else}
      {#each stocks as s}
        <div
          class="flex cursor-pointer items-center justify-between px-5 py-3.5 transition hover:bg-gray-50 dark:hover:bg-white/5"
          onclick={() => goto(`/stocks/${s.stock_id}`)}
          onkeydown={(e) => e.key === 'Enter' && goto(`/stocks/${s.stock_id}`)}
          role="button"
          tabindex="0"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">{s.name}</p>
            <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{s.quantity} {s.unit}</p>
          </div>
          <div class="ml-4 shrink-0 text-xs text-gray-400 dark:text-gray-500">{formatDate(s.date)}</div>
        </div>
      {/each}
    {/if}
  </div>
</div>
