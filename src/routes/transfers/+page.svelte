<script lang="ts">
	import { goto } from "$app/navigation";
	import TablePagination from "$lib/components/TablePagination.svelte";
	import { mc } from "$lib/merchant-styles.js";
	import { paginateSlice } from "$lib/pagination.js";
	import type { PageData } from "./$types";

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

	type Branch = { id: string; name?: string | null };
	type Merchant = { id: string; first_name?: string | null; last_name?: string | null };

	let { data }: { data: PageData } = $props();

	const transfers = (data.transfers ?? []) as Transfer[];
	const branches = (data.branches ?? []) as Branch[];
	const merchants = (data.merchants ?? []) as Merchant[];

	let fromFilter = $state("");
	let toFilter = $state("");
	let destinationMerchantFilter = $state("");
	let createdByFilter = $state("");
	let tablePage = $state(1);
	let tablePageSize = $state(10);

	const filteredTransfers = $derived.by(() =>
		transfers.filter((t) => {
			if (fromFilter && t.from !== fromFilter) return false;
			if (toFilter && t.to !== toFilter) return false;
			if (destinationMerchantFilter && t.destination_merchant !== destinationMerchantFilter) {
				return false;
			}
			if (createdByFilter && t.created_by !== createdByFilter) return false;
			return true;
		}),
	);

	const paginationResetKey = $derived(
		`${fromFilter}|${toFilter}|${destinationMerchantFilter}|${createdByFilter}`,
	);

	const pagedTransfers = $derived(
		paginateSlice(filteredTransfers, tablePage, tablePageSize),
	);

	const senderMerchantIds = $derived.by(() => {
		const ids = new Set<string>();
		for (const t of transfers) {
			if (t.created_by) ids.add(t.created_by);
		}
		return Array.from(ids);
	});

	const destinationMerchantIds = $derived.by(() => {
		const ids = new Set<string>();
		for (const t of transfers) {
			if (t.destination_merchant) ids.add(t.destination_merchant);
		}
		return Array.from(ids);
	});

	function branchName(id: string | null | undefined) {
		if (!id) return "—";
		const b = branches.find((x) => x.id === id);
		return b?.name?.trim() ? b.name : `${id.slice(0, 8)}…`;
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
	<div>
		<h1 class={mc.pageTitle}>Transfers</h1>
		<p class={mc.pageSubtitle}>Transfers where you are sender or destination merchant.</p>
	</div>
</section>

<section class={mc.filterSection} aria-label="Filter transfers">
	<label>
		<span class={mc.filterLabel}>From</span>
		<select class={mc.filterSelect} bind:value={fromFilter}>
			<option value="">All</option>
			{#each branches as b}
				<option value={b.id}>{branchName(b.id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>To</span>
		<select class={mc.filterSelect} bind:value={toFilter}>
			<option value="">All</option>
			{#each branches as b}
				<option value={b.id}>{branchName(b.id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>Destination merchant</span>
		<select class={mc.filterSelect} bind:value={destinationMerchantFilter}>
			<option value="">All</option>
			{#each destinationMerchantIds as id}
				<option value={id}>{merchantName(id)}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class={mc.filterLabel}>Created by</span>
		<select class={mc.filterSelect} bind:value={createdByFilter}>
			<option value="">All</option>
			{#each senderMerchantIds as id}
				<option value={id}>{merchantName(id)}</option>
			{/each}
		</select>
	</label>
	<div class="flex items-end">
		<button class={mc.ghostBtn} type="button" onclick={clearFilters}>Clear</button>
	</div>
</section>

<section class={mc.tableSection}>
	<div class="overflow-x-auto">
		<table class={mc.table}>
			<thead>
				<tr>
					<th class={mc.colNumHead}>#</th>
					<th class={mc.th}>From</th>
					<th class={mc.th}>To</th>
					<th class={mc.th}>From merchant</th>
					<th class={mc.th}>To merchant</th>
					<th class={mc.th}>Stock</th>
					<th class={mc.thRight}>Quantity</th>
					<th class={mc.th}>Date</th>
				</tr>
			</thead>
			<tbody>
				{#if filteredTransfers.length === 0}
					<tr>
						<td colspan="8" class={mc.emptyCell}>No transfers found for current filters.</td>
					</tr>
				{:else}
					{#each pagedTransfers as t, i}
						{@const linkId = stockLinkId(t)}
						<tr
							class={linkId ? mc.rowClickable : ""}
							onclick={() => onTransferRowClick(t)}
							onkeydown={(e) => onTransferRowKeydown(e, t)}
							tabindex={linkId ? 0 : undefined}
							role={linkId ? "button" : undefined}
						>
							<td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
							<td class={mc.td}>{branchName(t.from)}</td>
							<td class={mc.td}>{branchName(t.to)}</td>
							<td class={mc.td}>{merchantName(t.created_by)}</td>
							<td class={mc.td}>{merchantName(t.destination_merchant)}</td>
							<td class={mc.td}>
								{#if linkId}
									{t.stock_display_name ?? "—"}
								{:else}
									<span class="text-gray-400">Unavailable</span>
								{/if}
							</td>
							<td class={mc.tdRight}>{quantityLabel(t.quantity)}</td>
							<td class={mc.td}>{formatDate(t.created_at)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
	<TablePagination
		bind:page={tablePage}
		bind:pageSize={tablePageSize}
		total={filteredTransfers.length}
		resetKey={paginationResetKey}
	/>
</section>
