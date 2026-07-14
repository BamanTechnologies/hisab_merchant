<script lang="ts">
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { Clock } from "@lucide/svelte";
  import TableLoading from "$lib/components/TableLoading.svelte";

  type UnpaidOrder = {
    id: string;
    customer_name: string;
    total_amount: number;
    outstanding_amount: number;
    created_at: string;
    status: string;
  };

  type Props = {
    orders: UnpaidOrder[];
    loading?: boolean;
  };

  let { orders, loading = false }: Props = $props();

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatMoney(v: number): string {
    return `ETB ${v.toLocaleString()}`;
  }

  function statusLabel(status: string): string {
    if (status === "unpaid") return "Unpaid";
    if (status === "partially_paid") return "Partial";
    return status;
  }

  function daysSince(dateString: string): number {
    const diff = Date.now() - new Date(dateString).getTime();
    return Math.floor(diff / 86400000);
  }
</script>

<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
  <div class="overflow-x-auto">
    <table class="w-full min-w-[500px] border-collapse text-sm">
      <thead>
        <tr>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('date')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('customer')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('total')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('dashboardOutstanding')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('status')}</th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <TableLoading rows={1} cols={5} />
        {:else if orders.length === 0}
          <tr>
            <td colspan="5" class="border-b border-gray-100 px-4 py-12 text-center text-sm text-gray-400 dark:border-white/5">
              <div class="flex flex-col items-center gap-2">
                <Clock size={40} class="text-gray-300 dark:text-gray-600" />
                <span>{$_('dashboardNoUnpaidOrders')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each orders as o}
            <tr
              class="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5"
              onclick={() => goto(`/orders/${o.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/orders/${o.id}`)}
              tabindex="0"
            >
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm tabular-nums text-gray-500 dark:border-white/5 dark:text-gray-400">
                {formatDate(o.created_at)}
                <span class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({daysSince(o.created_at)}d)</span>
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:border-white/5 dark:text-gray-300">
                {o.customer_name}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-gray-900 dark:border-white/5 dark:text-gray-100">
                {formatMoney(o.total_amount)}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatMoney(o.outstanding_amount)}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:border-white/5 dark:text-gray-300">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {o.status === 'unpaid' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : o.status === 'partially_paid' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : ''}"
                >
                  {statusLabel(o.status)}
                </span>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
