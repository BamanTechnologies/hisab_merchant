<script lang="ts">
	import type { MetricIconId } from "$lib/dashboard-metric-icons.js";
	import { METRIC_ICONS } from "$lib/dashboard-metric-icons.js";

	type Props = {
		value: string;
		label: string;
		icon: MetricIconId;
	};

	let { value, label, icon }: Props = $props();
</script>

<article class="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#0f172a]">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<p class="text-lg font-bold leading-tight tracking-tight text-gray-900 tabular-nums dark:text-gray-50">
				{value}
			</p>
			<p class="mt-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
		</div>
		<img
			src={METRIC_ICONS[icon]}
			alt=""
			class="size-12 shrink-0 object-contain sm:size-[3.25rem]"
			aria-hidden="true"
		/>
	</div>
</article>
