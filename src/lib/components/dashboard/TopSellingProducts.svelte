<script lang="ts">
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { TrendingUp } from "@lucide/svelte";

  type Product = {
    product_id: string;
    name: string;
    quantity: number;
    unit: string;
    revenue: number;
  };

  type Props = {
    products: Product[];
    loading?: boolean;
  };

  let { products, loading = false }: Props = $props();

  function formatMoney(v: number): string {
    return `ETB ${v.toLocaleString()}`;
  }
</script>

<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
    <div class="flex items-center gap-3">
      <div class="flex size-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/15">
        <TrendingUp size={20} class="text-red-600 dark:text-red-400" />
      </div>
      <h3 class="text-base font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100">{$_('dashboardTopSellingProducts')}</h3>
    </div>
  </div>
  <div class="divide-y divide-gray-50 dark:divide-white/5">
    {#if loading}
      {#each Array(5) as _}
        <div class="flex items-center justify-between px-5 py-3.5">
          <div class="space-y-1.5">
            <div class="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            <div class="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
          </div>
          <div class="space-y-1.5 text-right">
            <div class="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            <div class="h-3 w-14 animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
          </div>
        </div>
      {/each}
    {:else if products.length === 0}
      <div class="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
        <TrendingUp size={40} class="text-gray-300 dark:text-gray-600" />
        <span>{$_('dashboardNoTopSelling')}</span>
      </div>
    {:else}
      {#each products as p}
        <div
          class="flex cursor-pointer items-center justify-between px-5 py-3.5 transition hover:bg-gray-50 dark:hover:bg-white/5"
          onclick={() => goto(`/products/${p.product_id}`)}
          onkeydown={(e) => e.key === 'Enter' && goto(`/products/${p.product_id}`)}
          role="button"
          tabindex="0"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">{p.name}</p>
            <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{$_('dashboardSold', { values: { count: p.quantity, unit: p.unit } })}</p>
          </div>
          <div class="ml-4 text-right">
            <p class="text-sm font-bold text-gray-900 tabular-nums dark:text-gray-100">{formatMoney(p.revenue)}</p>
            <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{$_('dashboardRevenue')}</p>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
