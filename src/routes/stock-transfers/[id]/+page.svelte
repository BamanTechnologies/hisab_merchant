<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { deserialize } from "$app/forms";
  import { mc } from "$lib/merchant-styles.js";
  import { ArchiveRestore, X } from "@lucide/svelte";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
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

  const transfer = $derived(data.transfer as Record<string, unknown> | null);
  const fromName = data.fromName as string | null;
  const toName = data.toName as string | null;
  const creatorName = data.creatorName as string | null;
  const destMerchantName = data.destMerchantName as string | null;
  const batches = $derived(
    (transfer?.stock_transfer_batches ?? []) as StockTransferBatch[],
  );

  const totalQty = $derived(
    batches.reduce((sum, b) => sum + Number(b.quantity ?? 0), 0),
  );

  const subscriptionLocked = $derived($subscriptionBlocksMutations);
  const isArchived = $derived((transfer?.is_deleted ?? false) === true);

  let showRestoreModal = $state(false);
  let restorePending = $state(false);
  let restoreError = $state("");

  function openRestoreModal() {
    if (subscriptionLocked) return;
    restoreError = "";
    showRestoreModal = true;
  }

  function closeRestoreModal(force = false) {
    if (!force && restorePending) return;
    showRestoreModal = false;
  }

  async function confirmRestore() {
    if (restorePending) return;
    restorePending = true;
    restoreError = "";
    try {
      const formData = new FormData();
      formData.append("id", String(transfer?.id ?? ""));
      const response = await fetch("?/restoreStockTransfer", {
        method: "POST",
        body: formData,
      });
      const result = deserialize(await response.text());
      const t = toastFromActionResult(result);
      if (t) showToast(t.message, t.variant);
      const payload =
        result.type === "success" && "data" in result
          ? (result.data as { success?: boolean } | undefined)
          : undefined;
      if (result.type === "success" && payload?.success) {
        closeRestoreModal(true);
        await invalidateAll();
      } else if (t?.variant === "error") {
        restoreError = t.message;
      }
    } catch (err) {
      restoreError =
        err instanceof Error ? err.message : "Failed to restore transfer";
    } finally {
      restorePending = false;
    }
  }

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
  <div class="flex flex-wrap gap-2">
    {#if isArchived}
      <button
        type="button"
        class={mc.primaryBtn}
        onclick={openRestoreModal}
        disabled={subscriptionLocked}
        title={subscriptionLocked
          ? SUBSCRIPTION_BLOCKED_MESSAGE
          : "Restore this transfer and its batch slices"}
      >
        <ArchiveRestore size={14} strokeWidth={2} />
        Restore transfer
      </button>
    {/if}
    <button
      type="button"
      class={mc.tableBtn}
      onclick={() => goto("/transfers")}
    >
      &larr; Back to transfers
    </button>
  </div>
</section>

{#if isArchived}
  <div
    class="mb-4 flex items-center gap-2 rounded-lg border border-[#d15b5b] bg-rose-50 px-5 py-3 dark:border-rose-500/30 dark:bg-rose-950/30"
    role="status"
  >
    <ArchiveRestore size={16} strokeWidth={2} class="shrink-0 text-rose-700 dark:text-rose-400" />
    <span class="text-sm font-semibold text-rose-700 dark:text-rose-400">
      This transfer is archived and hidden from the active transfers list.
    </span>
  </div>
{/if}

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

{#if showRestoreModal && transfer}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !restorePending && closeRestoreModal()}
    onkeydown={(e) =>
      !restorePending && (e.key === "Enter" || e.key === " ") && closeRestoreModal()}
  ></div>
  <dialog
    open
    class="modal modal-compact"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => restorePending && e.preventDefault()}
  >
    <header>
      <h2>Restore transfer</h2>
      <button
        class="icon"
        aria-label="Close"
        disabled={restorePending}
        onclick={() => closeRestoreModal()}>✕</button
      >
    </header>
    <div class="modal-body">
      <p>
        Restore this transfer? It will be returned to the active transfers list
        with its batch slices.
      </p>
      {#if restoreError}
        <p class="modal-error">{restoreError}</p>
      {/if}
    </div>
    <footer>
      <button
        type="button"
        class="ghost"
        onclick={() => closeRestoreModal()}
        disabled={restorePending}>
        Cancel
      </button>
      <button
        type="button"
        class="primary"
        onclick={confirmRestore}
        disabled={restorePending}>
        {restorePending ? "Restoring…" : "Restore"}
      </button>
    </footer>
  </dialog>
{/if}

<style>
  .modal-error {
    margin-top: 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid #fecaca;
    background: #fef2f2;
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    color: #b91c1c;
  }

  :global(.dark) .modal-error {
    border-color: rgb(248 113 113 / 0.3);
    background: rgb(239 68 68 / 0.1);
    color: #fca5a5;
  }
</style>
