<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import TablePagination from "$lib/components/TablePagination.svelte";
	import { mc } from "$lib/merchant-styles.js";
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

	type Branch = { id: string; name?: string | null };
	type Merchant = { id: string; first_name?: string | null; last_name?: string | null };

	let { data }: { data: PageData } = $props();

	let transfers = $state((data.transfers ?? []) as Transfer[]);
	let totalCount = $state((data as { totalCount: number }).totalCount ?? 0);
	const branches = (data.branches ?? []) as Branch[];
	const merchants = (data.merchants ?? []) as Merchant[];

	let fromFilter = $state($page.url.searchParams.get("from") ?? "");
	let toFilter = $state($page.url.searchParams.get("to") ?? "");
	let destinationMerchantFilter = $state($page.url.searchParams.get("destination_merchant") ?? "");
	let createdByFilter = $state($page.url.searchParams.get("created_by") ?? "");
	let tablePage = $state(Number($page.url.searchParams.get("page")) || 1);
	let tablePageSize = $state(Number($page.url.searchParams.get("pageSize")) || 10);
	let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressPageNav = $state(false);

	$effect(() => {
		transfers = (data.transfers ?? []) as Transfer[];
		totalCount = (data as { totalCount: number }).totalCount ?? 0;
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

	function navigateWithState() {
		const params = new URLSearchParams();
		if (fromFilter) params.set("from", fromFilter);
		if (toFilter) params.set("to", toFilter);
		if (destinationMerchantFilter) params.set("destination_merchant", destinationMerchantFilter);
		if (createdByFilter) params.set("created_by", createdByFilter);
		if (tablePage > 1) params.set("page", String(tablePage));
		if (tablePageSize !== 10) params.set("pageSize", String(tablePageSize));
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
		<h1 class={mc.pageTitle}>{$_('pageTransfersTitle')}</h1>
		<p class={mc.pageSubtitle}>{$_('pageTransfersSubtitle')}</p>
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
							<td class={mc.td}>{branchName(t.from)}</td>
							<td class={mc.td}>{branchName(t.to)}</td>
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
			</tbody>
		</table>
	</div>
	<TablePagination
		bind:page={tablePage}
		bind:pageSize={tablePageSize}
		total={totalCount}
	/>
</section>
