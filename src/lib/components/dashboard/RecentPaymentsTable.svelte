<script lang="ts">
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
  import { Wallet } from "@lucide/svelte";
  import TableLoading from "$lib/components/TableLoading.svelte";

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

  type Props = {
    payments: Payment[];
    loading?: boolean;
  };

  let { payments, loading = false }: Props = $props();

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
    const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }
</script>

<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
  <div class="overflow-x-auto">
    <table class="w-full min-w-[500px] border-collapse text-sm">
      <thead>
        <tr>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('date')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('amount')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('customer')}</th>
          <th class="h-[30px] whitespace-nowrap border-b border-gray-100 bg-gray-50 px-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-[#111827] dark:text-gray-400">{$_('method')}</th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <TableLoading rows={1} cols={4} />
        {:else if payments.length === 0}
          <tr>
            <td colspan="4" class="border-b border-gray-100 px-4 py-12 text-center text-sm text-gray-400 dark:border-white/5">
              <div class="flex flex-col items-center gap-2">
                <Wallet size={40} class="text-gray-300 dark:text-gray-600" />
                <span>{$_('noPaymentsEmpty')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each payments as p}
            <tr
              class="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5"
              onclick={() => goto(`/orders/${p.order_id}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/orders/${p.order_id}`)}
              tabindex="0"
            >
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm tabular-nums text-gray-500 dark:border-white/5 dark:text-gray-400">
                {p.created_at ? formatDate(p.created_at) : "—"}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:border-white/5 dark:text-gray-100">
                {formatMoney(p.amount)}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:border-white/5 dark:text-gray-300">
                {p.order?.customer_name?.trim() || "—"}
              </td>
              <td class="border-b border-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:border-white/5 dark:text-gray-300">
                {p.payment_method}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
