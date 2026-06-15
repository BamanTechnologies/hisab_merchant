<script lang="ts">
	import { Search } from "@lucide/svelte";
	import { _ } from "svelte-i18n";

	type Props = {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		class?: string;
	};

	let {
		value = $bindable(""),
		placeholder,
		ariaLabel,
		class: className = "",
	}: Props = $props();

	const resolvedPlaceholder = $derived(placeholder ?? $_('searchDots'));
	const resolvedAriaLabel = $derived(ariaLabel ?? $_('search'));
</script>

<div
	class="merchant-table-search flex h-[30px] w-full min-w-48 max-w-md items-center gap-2 self-center rounded-[5px] border border-[#e6eaed] bg-white px-3 {className}"
>
	<Search size={16} strokeWidth={2} class="shrink-0 text-gray-400" aria-hidden="true" />
	<input
		type="text"
		class="merchant-table-search-input min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm leading-normal text-[#1a1a1a] shadow-none placeholder:text-gray-400 focus:outline-none focus:ring-0"
		placeholder={resolvedPlaceholder}
		aria-label={resolvedAriaLabel}
		bind:value
	/>
</div>
