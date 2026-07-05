<script lang="ts">
	import { ArrowDownUp } from "@lucide/svelte";
	import { mc } from "$lib/merchant-styles.js";

	type Props = {
		label: string;
		onclick: () => void;
		ascActive?: boolean;
		descActive?: boolean;
		align?: "left" | "center" | "right";
	};

	let {
		label,
		onclick,
		ascActive = false,
		descActive = false,
		align = "left",
	}: Props = $props();

	const sortActive = $derived(ascActive || descActive);

	const alignClass = $derived(
		align === "center"
			? "w-full justify-center"
			: align === "right"
				? "w-full justify-end"
				: "",
	);
</script>

<button
	type="button"
	class="{mc.sortBtn} {alignClass}"
	onclick={(e) => {
		e.stopPropagation();
		onclick();
	}}
>
	<span class="whitespace-nowrap">{label}</span>
	<ArrowDownUp
		size={14}
		strokeWidth={2}
		class={sortActive ? "shrink-0 text-[#1a1a1a]" : "shrink-0 text-gray-400"}
		aria-hidden="true"
	/>
</button>
