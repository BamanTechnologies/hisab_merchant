<script lang="ts">
	import { cn } from '$lib/utils.js';
	import {
		subscriptionSnapshot,
		subscriptionStore
	} from '$lib/subscription/client';
	import { AlertTriangle } from '@lucide/svelte';

	type Props = {
		class?: string;
	};

	let { class: className }: Props = $props();

	const snapshot = $derived($subscriptionSnapshot);
	const storeState = $derived($subscriptionStore);

	const visible = $derived(
		storeState.loaded &&
			!storeState.error &&
			snapshot.showWarningBar &&
			snapshot.warningMessage
	);

	/** Stronger primary banner — urgency ramps via border/shadow, not a different hue. */
	const strengthClass = $derived.by(() => {
		switch (snapshot.status) {
			case 'SUSPENDED':
				return 'border-l-white/90 shadow-[0_2px_10px_rgba(61,143,212,0.45)] ring-[#3d8fd4]/50';
			case 'GRACE':
				return 'border-l-white/70 shadow-[0_2px_8px_rgba(61,143,212,0.4)] ring-[#3d8fd4]/45';
			case 'ACTIVE':
				return 'border-l-white/50 shadow-[0_2px_8px_rgba(77,160,230,0.35)] ring-[#3d8fd4]/40';
			case 'TRIAL':
			default:
				return 'border-l-white/40 shadow-[0_2px_8px_rgba(77,160,230,0.3)] ring-[#3d8fd4]/35';
		}
	});
</script>

{#if visible}
	<div
		class={cn(
			'flex min-h-8 items-center border-b border-[#3d8fd4] border-l-4 bg-[#4DA0E6] px-3 py-1 text-xs text-white ring-1 sm:px-4',
			'dark:border-[#3d8fd4] dark:bg-[#4DA0E6] dark:shadow-[0_2px_10px_rgba(77,160,230,0.3)]',
			strengthClass,
			className
		)}
		role="status"
		aria-live="polite"
	>
		<div class="flex w-full min-w-0 items-center gap-2">
			<AlertTriangle
				size={15}
				strokeWidth={2.25}
				class="shrink-0 opacity-95"
				aria-hidden="true"
			/>
			<div
				class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
			>
				<p class="font-semibold leading-tight">{snapshot.warningMessage}</p>
				{#if snapshot.planLabel}
					<p
						class="shrink-0 self-start rounded border border-white/25 bg-white/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase leading-none tracking-wide text-white backdrop-blur-[1px] sm:self-auto"
					>
						{snapshot.planLabel}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
