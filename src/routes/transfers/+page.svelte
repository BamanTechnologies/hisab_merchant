<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import TablePagination from "$lib/components/TablePagination.svelte";
    import TableLoading from "$lib/components/TableLoading.svelte";
  import { mc } from "$lib/merchant-styles.js";
    import { navigating } from "$app/state";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";
  import { allocateFifo } from "$lib/inventory/fifo";
  import { buildProductLabel } from "$lib/inventory/productLabel";
  import SearchSelect from "$lib/components/ui/search-select/search-select.svelte";
  import type { ProductRecord } from "$lib/inventory/types";
  import type { PageData } from "./$types";
  import { _ } from "svelte-i18n";

  type Transfer = {
    id: string;
    stock?: string | null;
    destination_stock?: string | null;
    from?: string | null;
    to?: string | null;
    created_by?: string | null;
    destination_merchant?: string | null;
    quantity?: number | string | null;
    created_at?: string | null;
    stock_link_id?: string | null;
    stock_display_name?: string;
  };

  type StockTransferBatch = {
    id: string;
    stock_id?: string | null;
    destination_stock?: string | null;
    quantity?: number | string | null;
    created_at?: string | null;
  };

  type StockTransfer = {
    id: string;
    from?: string | null;
    to?: string | null;
    destination_merchant?: string | null;
    request_hash?: string | null;
    created_by?: string | null;
    created_at?: string | null;
    stock_transfer_batches?: StockTransferBatch[] | null;
  };

  type ProductBatchRow = {
    id: string;
    quantity: number | string;
    selling_price: unknown;
    created_at?: string | null;
    batch_number?: string | null;
  };

  type ProductForTransfer = {
    id: string;
    name: string;
    default_unit?: string | null;
    factor?: unknown;
    attributes?: Record<string, unknown> | null;
    product_type?: { id?: string; name?: string | null } | null;
    stocks: ProductBatchRow[];
  };

  type Branch = { id: string; name?: string | null };
  type Merchant = { id: string; first_name?: string | null; last_name?: string | null };

  let { data }: { data: PageData } = $props();

  let transfers = $state((data.transfers ?? []) as Transfer[]);
  let totalCount = $state((data as { totalCount: number }).totalCount ?? 0);
  const branches = (data.branches ?? []) as Branch[];
  const merchants = (data.merchants ?? []) as Merchant[];
  let stockTransfers = $state((data as any).stockTransfers ?? []) as StockTransfer[];
  let stockTransfersTotal = $state((data as any).stockTransfersTotal ?? 0);
  const merchantBranchId = (data as any).merchantBranchId as string | null;

  let expandedTransferId = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedTransferId = expandedTransferId === id ? null : id;
  }

  let showFifoModal = $state(false);
  let fifoFormPending = $state(false);
  let fifoProductId = $state("");
  let fifoQuantity = $state(0);
  let fifoToBranchId = $state("");
  let fifoDestinationMerchantId = $state("");
  let selectedTransferProduct = $state<ProductForTransfer | null>(null);

  const fifoMerchantsForDest = $derived(
    fifoToBranchId
      ? merchants.filter((m) => {
          const mBranch = (m as any).branch;
          return mBranch === fifoToBranchId;
        })
      : []
  );
  (merchants as any).forEach((m: any) => {
    if (m.branch == null) m.branch = (data as any).merchantBranchId;
  });

  function positiveBatchesForProduct(product: ProductForTransfer): ProductBatchRow[] {
    return (product.stocks ?? []).filter((s) => Number(s.quantity) > 0);
  }

  function toFifoBatches(batches: ProductBatchRow[]) {
    return batches.map((b) => ({
      id: b.id,
      quantity: Number(b.quantity),
      selling_price: Number(b.selling_price),
      created_at: b.created_at ?? '',
      batch_number: b.batch_number ?? null,
    }));
  }

  function getSelectedProduct(): ProductForTransfer | null {
    if (!fifoProductId) return null;
    return selectedTransferProduct;
  }

  function productAvailableQty(product: ProductForTransfer): number {
    return positiveBatchesForProduct(product).reduce(
      (sum, b) => sum + Number(b.quantity), 0,
    );
  }

  const fifoPreview = $derived.by(() => {
    if (!fifoProductId) return null;
    const product = getSelectedProduct();
    if (!product) return null;
    const q = Number(fifoQuantity);
    if (!Number.isFinite(q) || q < 1) return null;
    const batches = toFifoBatches(positiveBatchesForProduct(product));
    return allocateFifo(batches, q);
  });

  const fifoAvailableQty = $derived(
    fifoProductId ? productAvailableQty(getSelectedProduct()!) : 0,
  );

  const fifoProductUnit = $derived(
    fifoProductId ? getSelectedProduct()?.default_unit?.trim() ?? 'units' : 'units',
  );

  const canSubmitFifoTransfer = $derived(
    !!fifoProductId && !!fifoToBranchId && fifoMerchantsForDest.length > 0 &&
      !!fifoDestinationMerchantId && fifoQuantity > 0 && fifoQuantity <= fifoAvailableQty
  );

  const subscriptionLocked = $derived($subscriptionBlocksMutations);

  function openFifoModal() {
    if (subscriptionLocked) return;
    fifoProductId = "";
    fifoQuantity = 0;
    fifoToBranchId = "";
    fifoDestinationMerchantId = "";
    showFifoModal = true;
  }

  function closeFifoModal() {
    if (fifoFormPending) return;
    showFifoModal = false;
  }

  function onFifoBranchChange() {
    fifoDestinationMerchantId = "";
  }

  function submitFifoTransfer(e: Event) {
    if (!canSubmitFifoTransfer) {
      e.preventDefault();
    }
  }

	let fromFilter = $state($page.url.searchParams.get("from") ?? "");
	let toFilter = $state($page.url.searchParams.get("to") ?? "");
	let destinationMerchantFilter = $state($page.url.searchParams.get("destination_merchant") ?? "");
	let createdByFilter = $state($page.url.searchParams.get("created_by") ?? "");
	let tablePage = $state(Number($page.url.searchParams.get("page")) || 1);
	let tablePageSize = $state(Number($page.url.searchParams.get("pageSize")) || 10);
	let stPage = $state(Number($page.url.searchParams.get("st_page")) || 1);
	let stPageSize = $state(Number($page.url.searchParams.get("st_pageSize")) || 10);
	let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressPageNav = $state(false);

	$effect(() => {
		transfers = (data.transfers ?? []) as Transfer[];
		totalCount = (data as { totalCount: number }).totalCount ?? 0;
		stockTransfers = (data as any).stockTransfers ?? [];
		stockTransfersTotal = (data as any).stockTransfersTotal ?? 0;
	});

	function branchName(id: string | null | undefined) {
		if (!id) return "—";
		const b = branches.find((x) => x.id === id);
		const raw = b?.name?.trim() ? b.name : `${id.slice(0, 8)}…`;
		return raw.replace(/_/g, " ");
	}

	function merchantName(id: string | null | undefined) {
		if (!id) return "—";
		const m = merchants.find((x) => x.id === id);
		if (!m) return `${id.slice(0, 8)}…`;
		const full = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
		return full || `${id.slice(0, 8)}…`;
	}

	function formatDate(v: string | null | undefined) {
		if (!v) return "—";
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return "—";
		return d.toLocaleString(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function quantityLabel(v: number | string | null | undefined) {
		const n = Number(v ?? 0);
		return Number.isFinite(n) ? n.toLocaleString() : "—";
	}

	function navigateWithState() {
		const params = new URLSearchParams();
		if (fromFilter) params.set("from", fromFilter);
		if (toFilter) params.set("to", toFilter);
		if (destinationMerchantFilter) params.set("destination_merchant", destinationMerchantFilter);
		if (createdByFilter) params.set("created_by", createdByFilter);
		if (tablePage > 1) params.set("page", String(tablePage));
		if (tablePageSize !== 10) params.set("pageSize", String(tablePageSize));
		if (stPage > 1) params.set("st_page", String(stPage));
		if (stPageSize !== 10) params.set("st_pageSize", String(stPageSize));
		const qs = params.toString();
		goto(qs ? `/transfers?${qs}` : "/transfers", { replaceState: true, keepFocus: true });
	}

	$effect(() => {
		const f = `${fromFilter}|${toFilter}|${destinationMerchantFilter}|${createdByFilter}`;
		const urlFrom = $page.url.searchParams.get("from") ?? "";
		const urlTo = $page.url.searchParams.get("to") ?? "";
		const urlDm = $page.url.searchParams.get("destination_merchant") ?? "";
		const urlCb = $page.url.searchParams.get("created_by") ?? "";
		const urlFilters = `${urlFrom}|${urlTo}|${urlDm}|${urlCb}`;
		if (f === urlFilters) return;

		clearTimeout(filterDebounceTimer);
		filterDebounceTimer = setTimeout(() => {
			suppressPageNav = true;
			tablePage = 1;
			stPage = 1;
			navigateWithState();
			suppressPageNav = false;
		}, 300);
	});

	$effect(() => {
		if (suppressPageNav) return;
		const pg = tablePage;
		const ps = tablePageSize;
		const urlPage = Number($page.url.searchParams.get("page")) || 1;
		const urlPageSize = Number($page.url.searchParams.get("pageSize")) || 10;
		if (pg === urlPage && ps === urlPageSize) return;
		navigateWithState();
	});

	$effect(() => {
		if (suppressPageNav) return;
		const pg = stPage;
		const ps = stPageSize;
		const urlPage = Number($page.url.searchParams.get("st_page")) || 1;
		const urlPageSize = Number($page.url.searchParams.get("st_pageSize")) || 10;
		if (pg === urlPage && ps === urlPageSize) return;
		navigateWithState();
	});

	function clearFilters() {
		fromFilter = "";
		toFilter = "";
		destinationMerchantFilter = "";
		createdByFilter = "";
	}

	function stockLinkId(t: Transfer): string | null {
		const id = t.stock_link_id;
		if (id == null) return null;
		const s = String(id).trim();
		return s.length > 0 ? s : null;
	}

	function onTransferRowClick(t: Transfer) {
		const id = stockLinkId(t);
		if (id) goto(`/stocks/${id}`);
	}

	function onTransferRowKeydown(e: KeyboardEvent, t: Transfer) {
		if (e.key !== "Enter" && e.key !== " ") return;
		const id = stockLinkId(t);
		if (!id) return;
		e.preventDefault();
		goto(`/stocks/${id}`);
	}
</script>


<section class={mc.pageHeader}>
	<div class=" w-full flex flex-col md:flex-row md:items-center justify-between">
    <div>
      <h1 class={mc.pageTitle}>{$_('pageTransfersTitle')}</h1>
      <p class={mc.pageSubtitle}>{$_('pageTransfersSubtitle')}</p>
    </div>
  {#if merchantBranchId}
      <button
        type="button"
        class={mc.primaryBtn}
        onclick={openFifoModal}
        disabled={subscriptionLocked}
        title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : "Transfer product stock via FIFO"}
      >
        New transfer
      </button>
    {/if}
	</div>
</section>

<section class={mc.filterSection} aria-label={$_('pageTransfersTitle')}>
	<label>
		<span class={mc.filterLabel}>{$_('from')}</span>
		<select class={mc.filterSelect} bind:value={fromFilter}>
			<option value="">{$_('all')}</option>
			{#each branches as b}
				<option value={b.id}>{branchName(b.id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>{$_('to')}</span>
		<select class={mc.filterSelect} bind:value={toFilter}>
			<option value="">{$_('all')}</option>
			{#each branches as b}
				<option value={b.id}>{branchName(b.id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>{$_('destinationMerchant')}</span>
		<select class={mc.filterSelect} bind:value={destinationMerchantFilter}>
			<option value="">{$_('all')}</option>
			{#each merchants as m}
				<option value={m.id}>{merchantName(m.id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>{$_('createdBy')}</span>
		<select class={mc.filterSelect} bind:value={createdByFilter}>
			<option value="">{$_('all')}</option>
			{#each merchants as m}
				<option value={m.id}>{merchantName(m.id)}</option>
			{/each}
		</select>
	</label>
	<div class="flex items-end">
		<button class={mc.ghostBtn} type="button" onclick={clearFilters}>{$_('clear')}</button>
	</div>
</section>
<section class="mt-8">
  <div class={mc.tableSection}>
    <div class="overflow-x-auto">
      <table class={mc.table}>
        <thead>
          <tr>
            <th class={mc.colNumHead}>#</th>
            <th class={mc.th}>From</th>
            <th class={mc.th}>To</th>
            <th class={mc.th}>Created by</th>
            <th class={mc.th}>Destination merchant</th>
            <th class={mc.thRight}>Total qty</th>
            <th class={mc.th}>Batches</th>
            <th class={mc.th}>Date</th>
            <th class={mc.th}></th>
          </tr>
        </thead>
        <tbody>
        {#if navigating.to}
          <TableLoading rows={1} cols={9} />
        {:else}
          {#if stockTransfers.length === 0}
            <tr>
              <td colspan="9" class={mc.emptyCell}>No product-level transfers yet.</td>
            </tr>
          {:else}
            {#each stockTransfers as st, i}
              {@const totalQty = (st.stock_transfer_batches ?? []).reduce(
                (sum, b) => sum + Number(b.quantity ?? 0), 0
              )}
              {@const batchCount = (st.stock_transfer_batches ?? []).length}
              <tr
                class={mc.rowClickable}
                onclick={() => toggleExpand(st.id)}
                onkeydown={(e) => (e.key === "Enter" || e.key === " ") && toggleExpand(st.id)}
                tabindex="0"
                role="button"
              >
                <td class={mc.colNum}>{(stPage - 1) * stPageSize + i + 1}</td>
                <td class="capitalize {mc.td}">{branchName(st.from)}</td>
                <td class="capitalize {mc.td}">{branchName(st.to)}</td>
                <td class={mc.td}>{merchantName(st.created_by)}</td>
                <td class={mc.td}>{merchantName(st.destination_merchant)}</td>
                <td class={mc.tdRight}>{quantityLabel(totalQty)}</td>
                <td class={mc.td}>{batchCount}</td>
                <td class={mc.td}>{formatDate(st.created_at)}</td>
                <td class={mc.td}>
                  <button
                    type="button"
                    class="text-xs font-semibold text-[#4DA0E6] hover:underline"
                    onclick={(e) => {
                      e.stopPropagation();
                      goto(`/stock-transfers/${st.id}`);
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
              {#if expandedTransferId === st.id}
                <tr>
                  <td colspan="9" class="p-0">
                    <div class="bg-gray-50 px-6 py-3 dark:bg-[#111827]">
                      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Batch slices
                      </p>
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-b border-gray-200 text-left text-xs font-medium text-gray-500 dark:border-white/10 dark:text-gray-400">
                            <th class="px-2 py-1">Source stock</th>
                            <th class="px-2 py-1">Destination stock</th>
                            <th class="px-2 py-1 text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each (st.stock_transfer_batches ?? []) as batch}
                            <tr class="border-b border-gray-100 text-sm text-gray-700 dark:border-white/5 dark:text-gray-300">
                              <td class="px-2 py-1 font-mono text-xs">{batch.stock_id?.slice(0, 8) ?? "\u2014"}</td>
                              <td class="px-2 py-1 font-mono text-xs">{batch.destination_stock?.slice(0, 8) ?? "\u2014"}</td>
                              <td class="px-2 py-1 text-right">{quantityLabel(batch.quantity)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        {/if}
        </tbody>
      </table>
    </div>
    <TablePagination
      bind:page={stPage}
      bind:pageSize={stPageSize}
      total={stockTransfersTotal}
    />
  </div>
</section>


<section class={mc.pageHeader}>
	<div class="mt-5">
		<h1 class={mc.pageTitle}>{$_('pageTransfersTitleOld')}</h1>
		<p class={mc.pageSubtitle}>{$_('pageTransfersSubtitle')}</p>
	</div>
</section>

<section class={mc.tableSection}>
	<div class="overflow-x-auto">
		<table class={mc.table}>
			<thead>
				<tr>
					<th class={mc.colNumHead}>{$_('number')}</th>
					<th class={mc.th}>{$_('from')}</th>
					<th class={mc.th}>{$_('to')}</th>
					<th class={mc.th}>{$_('fromMerchant')}</th>
					<th class={mc.th}>{$_('toMerchant')}</th>
					<th class={mc.th}>{$_('stock')}</th>
					<th class={mc.thRight}>{$_('quantity')}</th>
					<th class={mc.th}>{$_('date')}</th>
				</tr>
			</thead>
			<tbody>
        {#if navigating.to}
          <TableLoading rows={1} cols={8} />
        {:else}
				{#if transfers.length === 0}
					<tr>
						<td colspan="8" class={mc.emptyCell}>{$_('noTransfersFound')}</td>
					</tr>
				{:else}
					{#each transfers as t, i}
						{@const linkId = stockLinkId(t)}
						<tr
							class={linkId ? mc.rowClickable : ""}
							onclick={() => onTransferRowClick(t)}
							onkeydown={(e) => onTransferRowKeydown(e, t)}
							tabindex={linkId ? 0 : undefined}
							role={linkId ? "button" : undefined}
						>
							<td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
							<td class="capitalize {mc.td}">{branchName(t.from)}</td>
							<td class="capitalize {mc.td}">{branchName(t.to)}</td>
							<td class={mc.td}>{merchantName(t.created_by)}</td>
							<td class={mc.td}>{merchantName(t.destination_merchant)}</td>
							<td class={mc.td}>
								{#if linkId}
									{t.stock_display_name ?? "—"}
								{:else}
									<span class="text-gray-400">{$_('unavailable')}</span>
								{/if}
							</td>
							<td class={mc.tdRight}>{quantityLabel(t.quantity)}</td>
							<td class={mc.td}>{formatDate(t.created_at)}</td>
						</tr>
					{/each}
				{/if}
        {/if}
			</tbody>
		</table>
	</div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={totalCount}
  />
</section>


{#if showFifoModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !fifoFormPending && closeFifoModal()}
    onkeydown={(e) =>
      !fifoFormPending &&
      (e.key === "Enter" || e.key === " ") &&
      closeFifoModal()}
  ></div>
  <dialog
    open
    class="modal modal-compact modal-wide"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => fifoFormPending && e.preventDefault()}
  >
    <header>
      <h2>New transfer</h2>
      <button
        class="icon"
        aria-label="Close"
        disabled={fifoFormPending}
        onclick={closeFifoModal}>✕</button
      >
    </header>
    <form
      class="form transfer-form"
      method="POST"
      action="?/transferStockFifo"
      onsubmit={submitFifoTransfer}
      use:enhance={() => {
        fifoFormPending = true;
        return async ({ update, result }) => {
          try {
            await update();
          } finally {
            fifoFormPending = false;
          }
          const t = toastFromActionResult(result);
          if (t) showToast(t.message, t.variant);
          const ok =
            result.type === "success" &&
            result.data &&
            typeof result.data === "object" &&
            "success" in result.data &&
            (result.data as { success?: boolean }).success === true;
          if (ok) {
            showFifoModal = false;
            fifoToBranchId = "";
            fifoDestinationMerchantId = "";
            afterToast(TOAST_MS, () => void invalidateAll());
          }
        };
      }}
    >
      <fieldset disabled={fifoFormPending}>
        <div class="fifo-form-grid">
          <label>
            <span>Product</span>
            <SearchSelect
              value={fifoProductId}
              onselect={(productId: string, product: any) => {
                fifoProductId = productId;
                selectedTransferProduct = product as ProductForTransfer;
              }}
              companyId={(data as any).companyId ?? ''}
              branchId={merchantBranchId ?? ''}
              placeholder="Search products..."
              itemLabel={(p: any) => {
                const label = buildProductLabel(p);
                const stocks = (p as any).stocks ?? [];
                const positive = stocks.filter((s: any) => Number(s.quantity) > 0);
                const q = positive.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
                const unit = (p as any).default_unit?.trim();
                const qtyHint = unit ? `${q} ${unit} avail` : `${q} avail`;
                return q > 0 ? `${label} (${qtyHint})` : `${label} (out of stock)`;
              }}
            />
          </label>
          <label>
            <span>Quantity (max {fifoAvailableQty} {fifoProductUnit})</span>
            <input
              type="number"
              name="quantity"
              bind:value={fifoQuantity}
              min="0.0001"
              max={fifoAvailableQty || undefined}
              step="any"
              required
            />
            {#if fifoQuantity > fifoAvailableQty}
              <p class="text-sm text-red-600 dark:text-red-400">
                Quantity exceeds available stock ({fifoAvailableQty} {fifoProductUnit}).
              </p>
            {/if}
          </label>
          <label>
            <span>Move to</span>
            <select
              name="to_branch"
              bind:value={fifoToBranchId}
              required
              class="native-select"
              onchange={onFifoBranchChange}
            >
              <option value="" disabled>Select branch</option>
              {#each branches as br}
                <option value={br.id}>{br.name ?? br.id}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Merchant</span>
            <select
              name="destination_merchant"
              bind:value={fifoDestinationMerchantId}
              class="native-select"
              required={fifoMerchantsForDest.length > 0}
              disabled={!fifoToBranchId || fifoMerchantsForDest.length === 0}
            >
              <option value="" disabled>
                {!fifoToBranchId
                  ? "Select a branch first"
                  : fifoMerchantsForDest.length === 0
                    ? "No merchants in this branch"
                    : "Select merchant"}
              </option>
              {#each fifoMerchantsForDest as m}
                <option value={m.id}>{merchantName(m.id)}</option>
              {/each}
            </select>
          </label>
        </div>
      </fieldset>

      {#if fifoPreview && fifoPreview.slices.length > 0}
        <div class="fifo-preview">
          <p class="fifo-preview-title">FIFO batch allocation</p>
          <table class="fifo-preview-table">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>Available</th>
                  <th>Qty taken</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {#each fifoPreview.slices as slice (slice.stock_id)}
                  {@const avail = positiveBatchesForProduct(getSelectedProduct()!).find(
                    (b) => b.id === slice.stock_id
                  )}
                  {@const availQty = avail ? Number(avail.quantity) : 0}
                  <tr>
                    <td>{slice.batch_number?.trim() || "\u2014"}</td>
                    <td>{availQty}</td>
                    <td>{slice.quantity}</td>
                    <td>{availQty - slice.quantity}</td>
                  </tr>
                {/each}
              </tbody>
          </table>
          {#if fifoPreview.remaining > 0}
            <p class="fifo-preview-warn">
              Short by {fifoPreview.remaining} {fifoProductUnit} &mdash; reduce quantity.
            </p>
          {/if}
        </div>
      {/if}

      <p class="transfer-note">
        Stock is taken from batches in <strong>FIFO</strong> order (earliest first).
        Each batch contributes its quantity, and a corresponding destination batch is
        created at the target branch.
      </p>
      <footer>
        <button
          type="button"
          class="ghost"
          onclick={closeFifoModal}
          disabled={fifoFormPending}>
          Cancel
        </button>
        <button
          type="submit"
          class="primary"
          disabled={!canSubmitFifoTransfer || fifoFormPending}
          >{fifoFormPending ? "Transferring\u2026" : "Transfer"}</button
        >
      </footer>
    </form>
  </dialog>
{/if}

<style>

  .fifo-preview {
    padding: 0.65rem;
    border-radius: 0.5rem;
    border: 1px solid #e6eaed;
    background: #f9fafb;
    margin: 0.75rem 0;
  }

  .fifo-preview-title {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }

  .fifo-preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .fifo-preview-table th,
  .fifo-preview-table td {
    padding: 0.3rem 0.45rem;
    text-align: left;
    border-bottom: 1px solid #eef1f4;
  }

  .fifo-preview-table th {
    font-weight: 600;
    color: #6b7280;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .fifo-preview-table td {
    color: #111827;
  }

  .fifo-preview-warn {
    margin: 0.45rem 0 0;
    font-size: 0.8rem;
    color: #dc2626;
    font-weight: 600;
  }
</style>