<script lang="ts">
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { Users } from "@lucide/svelte";
  import TableLoading from "$lib/components/TableLoading.svelte";

  type TopCustomer = {
    id: string;
    customer_name: string;
    order_count: number;
    total_spent: number;
  };

  type Props = {
    customers: TopCustomer[];
    loading?: boolean;
  };

  let { customers, loading = false }: Props = $props();

  function formatMoney(v: number): string {
    return `ETB ${v.toLocaleString()}`;
  }
</script>

<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
  <div class="overflow-x-auto">
    <table class="w-full min-w-[400px] border-collapse text-sm">
      <thead>
        <tr>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('customer')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('dashboardOrders')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('dashboardTotalSpent')}</th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <TableLoading rows={1} cols={3} />
        {:else if customers.length === 0}
          <tr>
            <td colspan="3" class="border-b border-gray-100 px-4 py-12 text-center text-sm text-gray-400 dark:border-white/5">
              <div class="flex flex-col items-center gap-2">
                <Users size={40} class="text-gray-300 dark:text-gray-600" />
                <span>{$_('dashboardNoTopCustomers')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each customers as c}
            <tr
              onclick={() => goto(`/customers/${c.id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/customers/${c.id}`)}
              tabindex="0"
              class="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm font-medium text-gray-900 dark:border-white/5 dark:text-gray-100">
                {c.customer_name}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:border-white/5 dark:text-gray-300">
                {c.order_count}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-gray-900 dark:border-white/5 dark:text-gray-100">
                {formatMoney(c.total_spent)}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
