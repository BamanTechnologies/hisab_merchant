<script lang="ts">
	import { ChevronLeft, ChevronRight } from "@lucide/svelte";
	import {
		buildPageList,
		DEFAULT_PAGE_SIZE,
		PAGE_SIZE_OPTIONS,
	} from "$lib/pagination.js";

	type Props = {
		total: number;
		page?: number;
		pageSize?: number;
		resetKey?: string | number;
	};

	let {
		total,
		page = $bindable(1),
		pageSize = $bindable(DEFAULT_PAGE_SIZE),
		resetKey = "",
	}: Props = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(total / Math.max(1, pageSize))));
	const pageList = $derived(buildPageList(page, totalPages));

	$effect(() => {
		resetKey;
		page = 1;
	});

	$effect(() => {
		if (page > totalPages) page = totalPages;
		if (page < 1) page = 1;
	});

	function goTo(p: number) {
		page = Math.min(Math.max(1, p), totalPages);
	}
</script>

<nav
	class="flex flex-wrap items-center justify-between gap-4 border-t border-[#e6eaed] bg-white px-4 py-3"
	aria-label="Table pagination"
>
	<div class="flex items-center gap-2 text-sm text-gray-500">
		<span>Row Per Page</span>
		<select
			class="merchant-filter-select h-[30px] rounded-[5px] border border-[#e6eaed] bg-white py-0 pl-2 pr-8 text-sm text-gray-800"
			aria-label="Rows per page"
			value={pageSize}
			onchange={(e) => {
				pageSize = Number((e.currentTarget as HTMLSelectElement).value);
				page = 1;
			}}
		>
			{#each PAGE_SIZE_OPTIONS as n}
				<option value={n}>{n}</option>
			{/each}
		</select>
		<span>Entries</span>
	</div>

	<div class="flex items-center gap-1">
		<button
			type="button"
			class="inline-flex size-[30px] items-center justify-center rounded-full text-gray-500 hover:bg-gray-50 disabled:opacity-40"
			aria-label="Previous page"
			disabled={page <= 1}
			onclick={() => goTo(page - 1)}
		>
			<ChevronLeft size={18} />
		</button>

		{#each pageList as item}
			{#if item === "…"}
				<span class="px-1 text-sm text-gray-400" aria-hidden="true">…</span>
			{:else}
				<button
					type="button"
					class="inline-flex size-[30px] items-center justify-center rounded-full text-sm font-medium transition
						{item === page
						? 'bg-[#4DA0E6] text-white'
						: 'border border-[#e6eaed] text-gray-600 hover:bg-gray-50'}"
					aria-label="Page {item}"
					aria-current={item === page ? "page" : undefined}
					onclick={() => goTo(item)}
				>
					{item}
				</button>
			{/if}
		{/each}

		<button
			type="button"
			class="inline-flex size-[30px] items-center justify-center rounded-full text-gray-500 hover:bg-gray-50 disabled:opacity-40"
			aria-label="Next page"
			disabled={page >= totalPages}
			onclick={() => goTo(page + 1)}
		>
			<ChevronRight size={18} />
		</button>
	</div>
</nav>
