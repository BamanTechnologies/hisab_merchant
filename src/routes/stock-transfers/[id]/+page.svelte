<script lang="ts">
  import { goto } from "$app/navigation";
  import { mc } from "$lib/merchant-styles.js";
  import type { PageData } from "./$types";

  type StockTransferBatch = {
    id: string;
    stock_id?: string | null;
    destination_stock?: string | null;
    quantity?: number | string | null;
    created_at?: string | null;
    stockByStock?: {
      id: string;
      batch_number?: string | null;
      quantity?: number | string | null;
      selling_price?: number | string | null;
      product?: {
        id: string;
        name?: string | null;
        product_type?: { id: string; name?: string | null } | null;
      } | null;
    } | null;
    stockByDestinationStock?: {
      id: string;
      batch_number?: string | null;
      quantity?: number | string | null;
    } | null;
  };

  let { data }: { data: PageData } = $props();

  const transfer = data.transfer as Record<string, unknown> | null;
  const fromName = data.fromName as string | null;
  const toName = data.toName as string | null;
  const creatorName = data.creatorName as string | null;
  const destMerchantName = data.destMerchantName as string | null;
  const batches = (transfer?.stock_transfer_batches ?? []) as StockTransferBatch[];

  const totalQty = batches.reduce((sum, b) => sum + Number(b.quantity ?? 0), 0);

  function formatDate(v: string | null | undefined) {
    if (!v) return "\u2014";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "\u2014";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMoney(v: number | string | null | undefined) {
    const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function quantityLabel(v: number | string | null | undefined) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString() : "\u2014";
  }

  function displayName(v: string | null | undefined): string {
    return (v ?? "").replace(/_/g, " ") || "\u2014";
  }
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>Stock Transfer</h1>
    <p class={mc.pageSubtitle}>
      <span class="capitalize">{displayName(fromName)}</span> &rarr; <span class="capitalize">{displayName(toName)}</span>
    </p>
  </div>
  <button
    type="button"
    class={mc.tableBtn}
    onclick={() => goto("/transfers")}
  >
    &larr; Back to transfers
  </button>
</section>

{#if transfer}
  <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">From branch</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100 capitalize">{displayName(fromName)}</p>
    </div>
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">To branch</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100 capitalize">{displayName(toName)}</p>
    </div>
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Total quantity</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">{quantityLabel(totalQty)}</p>
    </div>
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Date</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">{formatDate(String(transfer.created_at ?? ""))}</p>
    </div>
  </div>

  <div class="mb-6 grid gap-4 sm:grid-cols-2">
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Created by</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">{creatorName ?? "\u2014"}</p>
    </div>
    <div class="rounded-[5px] border border-[#e6eaed] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#0f172a]">
      <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Destination merchant</p>
      <p class="mt-1 text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">{destMerchantName ?? "\u2014"}</p>
    </div>
  </div>

  <div class={mc.tableSection}>
    <div class="border-b border-[#e6eaed] bg-[#f2f2f2] px-4 py-3 dark:border-white/10 dark:bg-[#111827]">
      <h3 class="text-sm font-semibold text-[#1a1a1a] dark:text-gray-200">
        Batch slices ({batches.length})
      </h3>
    </div>
    <div class="overflow-x-auto">
      <table class={mc.table}>
        <thead>
          <tr>
            <th class={mc.th}>Product</th>
            <th class={mc.th}>Source batch</th>
            <th class={mc.th}>Source branch</th>
            <th class={mc.thRight}>Qty</th>
            <th class={mc.thRight}>Sell price</th>
            <th class={mc.th}>Destination batch</th>
          </tr>
        </thead>
        <tbody>
          {#if batches.length === 0}
            <tr>
              <td colspan="6" class={mc.emptyCell}>No batch slices recorded.</td>
            </tr>
          {:else}
            {#each batches as batch}
              <tr>
                <td class={mc.td}>
                  {#if batch.stockByStock?.product}
                    <span class="font-medium">{batch.stockByStock.product.name ?? "\u2014"}</span>
                    {#if batch.stockByStock.product.product_type?.name}
                      <span class="text-xs text-gray-400">
                        ({batch.stockByStock.product.product_type.name})
                      </span>
                    {/if}
                  {:else}
                    <span class="font-mono text-xs">{batch.stock_id?.slice(0, 8) ?? "\u2014"}</span>
                  {/if}
                </td>
                <td class={mc.td}>
                  {batch.stockByStock?.batch_number?.trim()
                    ? batch.stockByStock.batch_number
                    : batch.stock_id
                      ? batch.stock_id.slice(0, 8) + "\u2026"
                      : "\u2014"}
                </td>
                <td class="capitalize {mc.td}">{displayName(fromName)}</td>
                <td class={mc.tdRight}>{quantityLabel(batch.quantity)}</td>
                <td class={mc.tdRight}>
                  {batch.stockByStock?.selling_price != null
                    ? formatMoney(batch.stockByStock.selling_price)
                    : "\u2014"}
                </td>
                <td class={mc.td}>
                  {#if batch.stockByDestinationStock}
                    <span class="font-mono text-xs">
                      {batch.stockByDestinationStock.batch_number?.trim()
                        ? batch.stockByDestinationStock.batch_number
                        : batch.destination_stock?.slice(0, 8) + "\u2026"}
                    </span>
                  {:else}
                    <span class="text-gray-400">\u2014</span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
{:else}
  <p class="text-sm text-gray-500 dark:text-gray-400">Stock transfer not found.</p>
{/if}
