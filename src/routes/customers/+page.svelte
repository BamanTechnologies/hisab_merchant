<script lang="ts">
	import { goto } from "$app/navigation";
	import TablePagination from "$lib/components/TablePagination.svelte";
	import { mc } from "$lib/merchant-styles.js";
	import { paginateSlice } from "$lib/pagination.js";
	import type { PageData } from "./$types";
	import type { CustomerListRow } from "./+page.server";
	import { _ } from "svelte-i18n";

	let { data }: { data: PageData } = $props();

	let customers = $state(data.customers as CustomerListRow[]);
	let tablePage = $state(1);
	let tablePageSize = $state(10);

	$effect(() => {
		customers = data.customers as CustomerListRow[];
	});

	const pagedCustomers = $derived(
		paginateSlice(customers, tablePage, tablePageSize),
	);

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
</section>

{#if !data.companyId}
	<p class="mb-4 text-sm text-red-700">{$_('noBranchLinkedCustomers')}</p>
{:else if customers.length === 0}
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
				{#each pagedCustomers as c, i}
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
				{#if customers.length === 0 && data.companyId}
					<tr>
						<td colspan="5" class={mc.emptyCell}>{$_('noCustomersDisplay')}</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
	<TablePagination
		bind:page={tablePage}
		bind:pageSize={tablePageSize}
		total={customers.length}
		resetKey={customers.length}
	/>
</section>
