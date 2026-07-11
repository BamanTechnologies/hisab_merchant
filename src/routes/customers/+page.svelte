<script lang="ts">
	import { goto } from "$app/navigation";
	import { navigating } from "$app/state";
	import { page } from "$app/stores";
	import TableLoading from "$lib/components/TableLoading.svelte";
	import TablePagination from "$lib/components/TablePagination.svelte";
	import TableSearchInput from "$lib/components/TableSearchInput.svelte";
	import { mc } from "$lib/merchant-styles.js";
	import type { PageData } from "./$types";
	import type { CustomerListRow } from "./+page.server";
	import { _ } from "svelte-i18n";

	let { data }: { data: PageData } = $props();

	let customers = $state(data.customers as CustomerListRow[]);
	let totalCount = $state((data as { totalCount: number }).totalCount ?? 0);

	let searchQuery = $state($page.url.searchParams.get("search") ?? "");
	let tablePage = $state(Number($page.url.searchParams.get("page")) || 1);
	let tablePageSize = $state(Number($page.url.searchParams.get("pageSize")) || 10);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressPageNav = $state(false);

	$effect(() => {
		customers = data.customers as CustomerListRow[];
		totalCount = (data as { totalCount: number }).totalCount ?? 0;
	});

	function navigateWithState() {
		const params = new URLSearchParams();
		if (searchQuery) params.set("search", searchQuery);
		if (tablePage > 1) params.set("page", String(tablePage));
		if (tablePageSize !== 10) params.set("pageSize", String(tablePageSize));
		const qs = params.toString();
		goto(qs ? `/customers?${qs}` : "/customers", { replaceState: true, keepFocus: true });
	}

	$effect(() => {
		const q = searchQuery;
		const currentSearch = $page.url.searchParams.get("search") ?? "";
		if (q === currentSearch) return;

		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			suppressPageNav = true;
			tablePage = 1;
			navigateWithState();
			suppressPageNav = false;
		}, 600);
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

	function fullName(c: CustomerListRow) {
		return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "—";
	}

	function formatRegistered(iso: string | null | undefined) {
		if (!iso) return "—";
		try {
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return "—";
			return d.toLocaleString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return "—";
		}
	}

	function dash(v: string | null | undefined) {
		if (v == null || String(v).trim() === "") return "—";
		return String(v);
	}
</script>

<section class={mc.pageHeader}>
	<div>
		<h1 class={mc.pageTitle}>{$_('pageCustomersTitle')}</h1>
		<p class={mc.pageSubtitle}>{$_('pageCustomersSubtitle')}</p>
	</div>
	<TableSearchInput bind:value={searchQuery} placeholder={$_('searchDots')} />
</section>

{#if !data.companyId}
	<p class="mb-4 text-sm text-red-700">{$_('noBranchLinkedCustomers')}</p>
{:else if totalCount === 0}
	<p class="mb-4 text-sm text-gray-500">{$_('noCustomersRegistered')}</p>
{/if}

<section class={mc.tableSection}>
	<div class="overflow-x-auto">
		<table class={mc.table}>
			<thead>
				<tr>
					<th class={mc.colNumHead}>{$_('number')}</th>
					<th class={mc.th}>{$_('name')}</th>
					<th class={mc.th}>{$_('address')}</th>
					<th class={mc.th}>{$_('registered')}</th>
					<th class={mc.th}>{$_('phone')}</th>
				</tr>
			</thead>
			<tbody>
				{#if navigating.to}
					<TableLoading rows={1} cols={5} />
				{:else}
					{#each customers as c, i}
						<tr
							class={mc.rowClickable}
							onclick={() => goto(`/customers/${c.id}`)}
							tabindex="0"
							role="button"
						>
							<td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
							<td class={mc.td}>{fullName(c)}</td>
							<td class={mc.td}>{dash(c.address)}</td>
							<td class="{mc.td} whitespace-nowrap tabular-nums">{formatRegistered(c.created_at)}</td>
							<td class={mc.td}>{dash(c.phone_number)}</td>
						</tr>
					{/each}
					{#if customers.length === 0 && totalCount === 0 && data.companyId}
						<tr>
							<td colspan="5" class={mc.emptyCell}>{$_('noCustomersDisplay')}</td>
						</tr>
					{/if}
				{/if}
			</tbody>
		</table>
	</div>
	<TablePagination
		bind:page={tablePage}
		bind:pageSize={tablePageSize}
		total={totalCount}
		resetKey={totalCount}
	/>
</section>
